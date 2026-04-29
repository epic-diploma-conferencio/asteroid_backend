const express = require('express')
const path = require('path')
const multer = require('multer')
const config = require('../shared/config')
const { aggregateAnalyses, loadCompletedAnalyses } = require('./graph-service')
const { createAuthRouter } = require('./auth-routes')
const { getUserFromRequest } = require('./auth-utils')

function createRouter({ jobService, jobStore, authService, researchService }) {
  const router = express.Router()
  const upload = multer({
    limits: {
      fileSize: config.upload.maxFileSizeBytes
    }
  })

  if (authService) {
    router.use('/auth', createAuthRouter({ authService }))
  }

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

      const user = getUserFromRequest(req)
      const job = await jobService.submitFile(req.file)
      if (job.status !== 'COMPLETED') {
        return res.status(502).json({
          error: job.error?.message || 'Unable to complete upload processing.',
          code: job.error?.code || null,
          status: job.status
        })
      }

      const session = await researchService.createSessionFromJob({
        job,
        sourceName: req.file.originalname,
        fileCount: 1,
        userId: user?.id || null
      })

      return res.status(200).json({
        message: 'Upload completed and session created.',
        archiveId: session.sessionId,
        archiveName: session.archiveName,
        fileCount: session.fileCount,
        language: session.language
      })
    } catch (error) {
      if (error.name === 'MulterError') {
        return res.status(400).json({ error: error.message, code: error.code })
      }
      return res.status(500).json({ error: error.message })
    }
  })

  router.get('/rules/avaliable', (req, res) => {
    res.json({
      rules: researchService.getAvailableRules()
    })
  })

  router.post('/startAnalysis', async (req, res) => {
    try {
      const user = getUserFromRequest(req)
      const payload = req.body || {}
      const response = await researchService.startAnalysis({
        userId: user?.id || null,
        uploadId: payload.uploadId,
        rules: payload.rules,
        style: payload.ruleStyle
      })

      res.status(200).json({
        message: 'Analysis started successfully.',
        researchId: response.researchId,
        status: response.status
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  router.get('/saved', async (req, res) => {
    const user = getUserFromRequest(req)
    const items = await researchService.listSaved(user?.id || null)
    res.json({ items })
  })

  router.get('/saved/:id', async (req, res) => {
    const user = getUserFromRequest(req)
    const detail = await researchService.getResearch(req.params.id, user?.id || null)
    if (!detail) {
      return res.status(404).json({ error: 'Research not found' })
    }
    return res.json(detail)
  })

  router.patch('/saved/:id', async (req, res) => {
    const user = getUserFromRequest(req)
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const updated = await researchService.updateResearch(req.params.id, user.id, req.body || {})
    if (!updated) {
      return res.status(404).json({ error: 'Research not found' })
    }
    return res.json(updated)
  })

  router.delete('/saved/:id', async (req, res) => {
    const user = getUserFromRequest(req)
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const deleted = await researchService.deleteResearch(req.params.id, user.id)
    if (!deleted) {
      return res.status(404).json({ error: 'Research not found' })
    }

    return res.status(204).send()
  })

  router.get('/research/:id', async (req, res) => {
    const user = getUserFromRequest(req)
    const detail = await researchService.getResearchPublic(req.params.id, user?.id || null)
    if (!detail) {
      return res.status(404).json({ error: 'Research not found' })
    }
    return res.json(detail)
  })

  router.get('/research/:id/status', async (req, res) => {
    const user = getUserFromRequest(req)
    const detail = await researchService.getResearchPublic(req.params.id, user?.id || null)
    if (!detail) {
      return res.status(404).json({ error: 'Research not found' })
    }

    return res.json({
      id: detail.id,
      status: detail.status
    })
  })

  router.get('/graph-view', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'graph.html'))
  })

  return router
}

module.exports = {
  createRouter
}
