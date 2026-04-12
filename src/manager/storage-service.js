const config = require('../shared/config')
const { objectExists, putBuffer } = require('../shared/minio')

async function persistSourceFile(file, objectKey, hash) {
  const exists = await objectExists(config.minio.sourceBucket, objectKey)

  if (!exists) {
    await putBuffer(config.minio.sourceBucket, objectKey, file.buffer, {
      'Content-Type': file.mimetype,
      'X-Amz-Meta-Original-Name': file.originalname,
      'X-Amz-Meta-Hash': hash
    })
  }

  return { uploaded: !exists }
}

module.exports = {
  persistSourceFile
}
