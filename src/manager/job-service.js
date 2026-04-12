const axios = require('axios')
const config = require('../shared/config')
const { JOB_STATUS, buildJobRecord, buildWorkerTask } = require('../shared/contracts')
const { detectLanguage, buildObjectKey } = require('../shared/file-types')
const { createJobId, sha256 } = require('../shared/utils')
const { persistSourceFile } = require('./storage-service')
const { resolveWorker } = require('./worker-registry')

class JobService {
  constructor(jobStore) {
    this.jobStore = jobStore
  }

  async submitFile(file) {
    const language = detectLanguage(file.originalname)
    const hash = sha256(file.buffer)
    const objectKey = buildObjectKey(hash, file.originalname)

    const job = this.jobStore.create(buildJobRecord({
      jobId: createJobId(),
      hash,
      language,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      sourceObjectKey: objectKey
    }))

    if (!language) {
      return this.jobStore.update(job.jobId, {
        status: JOB_STATUS.UNSUPPORTED,
        error: {
          code: 'UNSUPPORTED_LANGUAGE',
          message: 'The manager could not detect a supported language by file extension.'
        }
      })
    }

    const storageResult = await persistSourceFile(file, objectKey, hash)
    this.jobStore.update(job.jobId, {
      status: JOB_STATUS.STORED,
      uploaded: storageResult.uploaded
    })

    const worker = resolveWorker(language)

    if (!worker || !worker.endpoint) {
      return this.jobStore.update(job.jobId, {
        status: JOB_STATUS.UNSUPPORTED,
        worker: worker ? worker.workerName : null,
        error: {
          code: 'WORKER_NOT_CONFIGURED',
          message: `No live worker is configured for language "${language}".`
        }
      })
    }

    this.jobStore.update(job.jobId, {
      status: JOB_STATUS.DISPATCHED,
      worker: worker.workerName
    })

    try {
      const response = await axios.post(
        worker.endpoint,
        buildWorkerTask({
          ...job,
          language,
          sourceBucket: config.minio.sourceBucket,
          sourceObjectKey: objectKey
        }),
        {
          timeout: 30000,
          headers: {
            'x-manager-source-bucket': config.minio.sourceBucket,
            'x-manager-result-bucket': config.minio.resultBucket
          }
        }
      )

      return this.jobStore.update(job.jobId, {
        status: JOB_STATUS.COMPLETED,
        resultObjectKey: response.data.resultObjectKey,
        analysisSummary: response.data.analysisSummary,
        worker: response.data.worker || worker.workerName,
        uploaded: storageResult.uploaded,
        error: null
      })
    } catch (error) {
      return this.jobStore.update(job.jobId, {
        status: JOB_STATUS.FAILED,
        worker: worker.workerName,
        uploaded: storageResult.uploaded,
        error: {
          code: 'WORKER_REQUEST_FAILED',
          message: error.response?.data?.error || error.message
        }
      })
    }
  }
}

module.exports = {
  JobService
}
