const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const config = require('../shared/config')

function getBearerToken(header) {
  if (!header || typeof header !== 'string') return null
  const [scheme, token] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null
  return token
}

function getUserFromRequest(req) {
  const token = getBearerToken(req.headers.authorization)
  if (!token) return null

  try {
    const payload = jwt.verify(token, config.auth.jwtAccessSecret)
    const userId = Number(payload.sub)
    if (!Number.isFinite(userId)) return null

    return {
      id: userId,
      login: payload.login || null
    }
  } catch {
    return null
  }
}

function createUuid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const bytes = crypto.randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

module.exports = {
  getUserFromRequest,
  createUuid
}