const Minio = require('minio')
const config = require('./config')

const client = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey
})

async function ensureBucket(bucketName) {
  const exists = await client.bucketExists(bucketName).catch(() => false)
  if (!exists) {
    await client.makeBucket(bucketName)
  }
}

async function ensureCoreBuckets() {
  await ensureBucket(config.minio.sourceBucket)
  await ensureBucket(config.minio.resultBucket)
}

async function objectExists(bucket, objectKey) {
  return client
    .statObject(bucket, objectKey)
    .then(() => true)
    .catch(() => false)
}

async function putBuffer(bucket, objectKey, buffer, metaData) {
  await client.putObject(bucket, objectKey, buffer, buffer.length, metaData)
}

async function readObjectAsBuffer(bucket, objectKey) {
  const stream = await client.getObject(bucket, objectKey)

  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function listObjectKeys(bucket) {
  const stream = client.listObjects(bucket, '', true)

  return new Promise((resolve, reject) => {
    const keys = []
    stream.on('data', item => {
      if (item?.name) keys.push(item.name)
    })
    stream.on('end', () => resolve(keys))
    stream.on('error', reject)
  })
}

module.exports = {
  client,
  ensureCoreBuckets,
  objectExists,
  putBuffer,
  readObjectAsBuffer,
  listObjectKeys
}
