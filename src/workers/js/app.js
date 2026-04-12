const express = require('express')
const config = require('../../shared/config')
const { ensureCoreBuckets, putBuffer, readObjectAsBuffer } = require('../../shared/minio')
const { buildResultObjectKey } = require('../../shared/file-types')
const { analyzeJavaScript } = require('./analyzer')

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({
    service: 'worker-js',
    status: 'ok',
    time: new Date().toISOString()
  })
})

app.post('/process', async (req, res) => {
  const sourceBucket = req.headers['x-manager-source-bucket'] || config.minio.sourceBucket
  const resultBucket = req.headers['x-manager-result-bucket'] || config.minio.resultBucket

  try {
    const task = req.body
    const objectKey = task?.artifact?.objectKey

    if (!objectKey) {
      return res.status(400).json({ error: 'artifact.objectKey is required' })
    }

    const buffer = await readObjectAsBuffer(sourceBucket, objectKey)
    const code = buffer.toString('utf8')
    const analysis = analyzeJavaScript(code, {
      objectKey,
      originalName: task.artifact.originalName,
      hash: task.artifact.hash
    })

    const resultObjectKey = buildResultObjectKey(task.artifact.hash)
    const payload = {
      jobId: task.jobId,
      language: task.language,
      source: task.artifact,
      processedAt: new Date().toISOString(),
      worker: 'worker-js',
      analysis
    }

    await putBuffer(
      resultBucket,
      resultObjectKey,
      Buffer.from(JSON.stringify(payload, null, 2)),
      { 'Content-Type': 'application/json' }
    )

    res.json({
      worker: 'worker-js',
      resultObjectKey,
      analysisSummary: analysis.summary
    })
  } catch (error) {
    console.error('JS worker failed:', error)
    res.status(500).json({ error: error.message })
  }
})

async function bootstrap() {
  await ensureCoreBuckets()
  const port = 4001
  app.listen(port, () => {
    console.log(`JS worker listening on ${port}`)
  })
}

bootstrap().catch(error => {
  console.error('JS worker bootstrap failed:', error)
  process.exit(1)
})
