const express = require('express')
const path = require('path')
const config = require('../shared/config')
const { ensureCoreBuckets } = require('../shared/minio')
const { pool, ensureAuthSchema } = require('../shared/postgres')
const { InMemoryJobStore } = require('../shared/job-store')
const { JobService } = require('./job-service')
const { AuthService } = require('./auth-service')
const { createRouter } = require('./routes')

async function bootstrap() {
  await ensureCoreBuckets()
  await ensureAuthSchema()

  const app = express()
  const jobStore = new InMemoryJobStore()
  const jobService = new JobService(jobStore)
  const authService = new AuthService(pool)

  app.use(express.json())
  app.get('/graph', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'graph.html'))
  })
  app.use('/api', createRouter({ jobService, jobStore, authService }))

  app.listen(config.manager.port, () => {
    console.log(`Manager service listening on ${config.manager.port}`)
  })
}

bootstrap().catch(error => {
  console.error('Manager bootstrap failed:', error)
  process.exit(1)
})
