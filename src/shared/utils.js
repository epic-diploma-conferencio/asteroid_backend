const crypto = require('crypto')

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function createJobId() {
  return crypto.randomUUID()
}

module.exports = {
  sha256,
  createJobId
}
