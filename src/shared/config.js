function getBoolean(value, fallback) {
  if (value === undefined) return fallback
  return value === 'true'
}

function getNumber(value, fallback) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

module.exports = {
  manager: {
    port: getNumber(process.env.PORT, 3000),
    publicUrl: process.env.MANAGER_PUBLIC_URL || 'http://127.0.0.1:3000'
  },
  workers: {
    javascript: process.env.WORKER_JS_URL || 'http://127.0.0.1:4001',
    typescript: process.env.WORKER_TS_URL || 'http://127.0.0.1:4002',
    python: process.env.WORKER_PY_URL || 'http://127.0.0.1:4003'
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: getNumber(process.env.MINIO_PORT, 9000),
    useSSL: getBoolean(process.env.MINIO_USE_SSL, false),
    accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
    secretKey: process.env.MINIO_SECRET_KEY || 'strongpassword',
    sourceBucket: process.env.MINIO_SOURCE_BUCKET || 'preprocessed',
    resultBucket: process.env.MINIO_RESULT_BUCKET || 'processed-files'
  },
  upload: {
    maxFileSizeBytes: getNumber(process.env.MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024)
  }
}
