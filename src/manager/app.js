const express = require('express')
const path = require('path')
const config = require('../shared/config')
const { ensureCoreBuckets } = require('../shared/minio')
const { pool, ensureAuthSchema, ensureResearchSchema } = require('../shared/postgres')
const { InMemoryJobStore } = require('../shared/job-store')
const { JobService } = require('./job-service')
const { AuthService } = require('./auth-service')
const { ResearchService } = require('./research-service')
const { createRouter } = require('./routes')

async function bootstrap() {
  await ensureCoreBuckets()
  await ensureAuthSchema()
  await ensureResearchSchema()

  const app = express()
  const jobStore = new InMemoryJobStore()
  const jobService = new JobService(jobStore)
  const authService = new AuthService(pool)
  const researchService = new ResearchService(pool)

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Vary', 'Origin')
    }
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
    return next()
  })

  app.use(express.json())
  app.get('/graph', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'graph.html'))
  })
  app.use('/api', createRouter({ jobService, jobStore, authService, researchService }))

  app.listen(config.manager.port, () => {
    console.log(`Manager service listening on ${config.manager.port}`)
  })
}

bootstrap().catch(error => {
  console.error('Manager bootstrap failed:', error)
  process.exit(1)
})
