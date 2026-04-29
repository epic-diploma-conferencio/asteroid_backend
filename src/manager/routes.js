const express = require('express')
const path = require('path')
const multer = require('multer')
const config = require('../shared/config')
const { aggregateAnalyses, loadCompletedAnalyses } = require('./graph-service')
const { readObjectAsBuffer } = require('../shared/minio')
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

  router.post('/upload', upload.any(), async (req, res) => {
    try {
      const inputFiles = Array.isArray(req.files) && req.files.length
        ? req.files
        : req.file
          ? [req.file]
          : []

      if (!inputFiles.length) {
        return res.status(400).json({ error: 'File payload is required in field "file" or "files".' })
      }

      const user = getUserFromRequest(req)
      const jobs = await Promise.all(inputFiles.map(file => jobService.submitFile(file)))
      const completedJobs = jobs.filter(job => job.status === 'COMPLETED')
      const failedJobs = jobs.filter(job => job.status !== 'COMPLETED')

      if (!completedJobs.length) {
        const firstFailed = failedJobs[0]
        return res.status(502).json({
          error: firstFailed?.error?.message || 'Unable to complete upload processing.',
          code: firstFailed?.error?.code || null,
          status: firstFailed?.status || 'FAILED',
          failedFiles: failedJobs.map(job => ({
            jobId: job.jobId,
            originalName: job.originalName,
            status: job.status,
            code: job.error?.code || null,
            error: job.error?.message || null
          }))
        })
      }

      const analyses = []
      for (const job of completedJobs) {
        if (!job.resultObjectKey) continue
        const buffer = await readObjectAsBuffer(config.minio.resultBucket, job.resultObjectKey)
        const payload = JSON.parse(buffer.toString('utf8'))
        if (payload.analysis) {
          analyses.push(payload.analysis)
        }
      }

      const stitchedAnalysis = {
        formatVersion: '1.0',
        generatedAt: new Date().toISOString(),
        files: completedJobs.map(job => ({
          jobId: job.jobId,
          originalName: job.originalName,
          language: job.language,
          sourceObjectKey: job.sourceObjectKey,
          resultObjectKey: job.resultObjectKey
        })),
        analyses,
        graph: aggregateAnalyses(analyses)
      }

      const primaryJob = completedJobs[0]
      const session = await researchService.createSessionFromJob({
        job: primaryJob,
        sourceName: inputFiles.length === 1 ? inputFiles[0].originalname : `${inputFiles.length} files`,
        fileCount: completedJobs.length,
        userId: user?.id || null
      })

      return res.status(200).json({
        message: failedJobs.length
          ? 'Upload partially completed and session created.'
          : 'Upload completed and session created.',
        archiveId: session.sessionId,
        archiveName: session.archiveName,
        fileCount: session.fileCount,
        language: session.language,
        completedFiles: completedJobs.length,
        failedFiles: failedJobs.map(job => ({
          jobId: job.jobId,
          originalName: job.originalName,
          status: job.status,
          code: job.error?.code || null,
          error: job.error?.message || null
        })),
        stitchedAnalysis
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
