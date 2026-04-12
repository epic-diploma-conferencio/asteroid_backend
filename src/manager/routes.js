const express = require('express')
const path = require('path')
const multer = require('multer')
const config = require('../shared/config')
const { aggregateAnalyses, loadCompletedAnalyses } = require('./graph-service')

function createRouter({ jobService, jobStore }) {
  const router = express.Router()
  const upload = multer({
    limits: {
      fileSize: config.upload.maxFileSizeBytes
    }
  })

  router.get('/health', (req, res) => {
    res.json({
      service: 'manager',
      status: 'ok',
      time: new Date().toISOString()
    })
  })

  router.get('/workers', (req, res) => {
    const { WORKER_DEFINITIONS } = require('./worker-registry')
    res.json(Object.values(WORKER_DEFINITIONS))
  })

  router.get('/jobs', (req, res) => {
    res.json(jobStore.list())
  })

  router.get('/jobs/:jobId', (req, res) => {
    const job = jobStore.get(req.params.jobId)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    res.json(job)
  })

  router.get('/graph', async (req, res) => {
    try {
      const analyses = await loadCompletedAnalyses(jobStore)
      res.json(aggregateAnalyses(analyses))
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File payload is required in field "file".' })
      }

      const job = await jobService.submitFile(req.file)
      res.status(job.status === 'FAILED' ? 502 : 202).json(job)
    } catch (error) {
      if (error.name === 'MulterError') {
        return res.status(400).json({ error: error.message, code: error.code })
      }
      res.status(500).json({ error: error.message })
    }
  })

  router.get('/graph-view', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'graph.html'))
  })

  return router
}

module.exports = {
  createRouter
}
