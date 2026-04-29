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
  },
  postgres: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: getNumber(process.env.POSTGRES_PORT, 5432),
    database: process.env.POSTGRES_DB || 'diploma',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    maxPoolSize: getNumber(process.env.POSTGRES_MAX_POOL_SIZE, 10)
  },
  auth: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    accessTokenTtlSeconds: getNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
    refreshTokenTtlSeconds: getNumber(process.env.JWT_REFRESH_TTL_SECONDS, 60 * 60 * 24 * 30),
    refreshCookieName: process.env.JWT_REFRESH_COOKIE_NAME || 'refreshToken',
    cookieSecure: getBoolean(process.env.JWT_COOKIE_SECURE, false),
    cookieDomain: process.env.JWT_COOKIE_DOMAIN || undefined,
    defaultAvatarBaseUrl: process.env.DEFAULT_AVATAR_BASE_URL || 'https://cdn.example.com/avatars'
  }
}
