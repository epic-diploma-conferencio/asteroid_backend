const JOB_STATUS = {
  RECEIVED: 'RECEIVED',
  STORED: 'STORED',
  DISPATCHED: 'DISPATCHED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  UNSUPPORTED: 'UNSUPPORTED'
}

function buildJobRecord({
  jobId,
  hash,
  language,
  originalName,
  mimeType,
  size,
  sourceObjectKey
}) {
  const now = new Date().toISOString()

  return {
    jobId,
    hash,
    language,
    originalName,
    mimeType,
    size,
    sourceObjectKey,
    resultObjectKey: null,
    status: JOB_STATUS.RECEIVED,
    createdAt: now,
    updatedAt: now,
    worker: null,
    uploaded: false,
    analysisSummary: null,
    error: null
  }
}

function buildWorkerTask(job) {
  return {
    jobId: job.jobId,
    language: job.language,
    artifact: {
      bucket: job.sourceBucket,
      objectKey: job.sourceObjectKey,
      originalName: job.originalName,
      mimeType: job.mimeType,
      hash: job.hash,
      size: job.size
    },
    requestedAt: new Date().toISOString()
  }
}

module.exports = {
  JOB_STATUS,
  buildJobRecord,
  buildWorkerTask
}
