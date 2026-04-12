const express = require('express')
const path = require('path')
const config = require('../shared/config')
const { ensureCoreBuckets } = require('../shared/minio')
const { InMemoryJobStore } = require('../shared/job-store')
const { JobService } = require('./job-service')
const { createRouter } = require('./routes')

async function bootstrap() {
  await ensureCoreBuckets()

  const app = express()
  const jobStore = new InMemoryJobStore()
  const jobService = new JobService(jobStore)

  app.use(express.json())
  app.get('/graph', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'graph.html'))
  })
  app.use('/api', createRouter({ jobService, jobStore }))

  app.listen(config.manager.port, () => {
    console.log(`Manager service listening on ${config.manager.port}`)
  })
}

bootstrap().catch(error => {
  console.error('Manager bootstrap failed:', error)
  process.exit(1)
})
