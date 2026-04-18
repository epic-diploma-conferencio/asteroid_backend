const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const config = require('../shared/config')

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConflictError'
  }
}

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase()
}

function assertRegisterPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a JSON object.')
  }

  const login = normalizeLogin(payload.login)
  const password = String(payload.password || '')
  const firstName = String(payload.firstName || '').trim()
  const lastName = String(payload.lastName || '').trim()

  if (!login || login.length < 3 || login.length > 32) {
    throw new ValidationError('Field "login" must be between 3 and 32 characters.')
  }
  if (!password || password.length < 8 || password.length > 72) {
    throw new ValidationError('Field "password" must be between 8 and 72 characters.')
  }
  if (!firstName || firstName.length > 60) {
    throw new ValidationError('Field "firstName" is required and must be up to 60 characters.')
  }
  if (!lastName || lastName.length > 60) {
    throw new ValidationError('Field "lastName" is required and must be up to 60 characters.')
  }

  return {
    login,
    password,
    firstName,
    lastName
  }
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function buildPublicUser(row) {
  return {
    login: row.login,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url
  }
}

class AuthService {
  constructor(pool) {
    this.pool = pool
  }

  async register(payload) {
    const normalized = assertRegisterPayload(payload)
    const passwordHash = await bcrypt.hash(normalized.password, 12)
    const avatarUrl = `${config.auth.defaultAvatarBaseUrl}/${encodeURIComponent(normalized.login)}/default.webp`

    let userRow
    try {
      const result = await this.pool.query(
        `
          INSERT INTO users (login, password_hash, first_name, last_name, avatar_url)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, login, first_name, last_name, avatar_url
        `,
        [normalized.login, passwordHash, normalized.firstName, normalized.lastName, avatarUrl]
      )
      userRow = result.rows[0]
    } catch (error) {
      if (error && error.code === '23505') {
        throw new ConflictError('User with this login already exists.')
      }
      throw error
    }

    const accessToken = jwt.sign(
      { sub: String(userRow.id), login: userRow.login, type: 'access' },
      config.auth.jwtAccessSecret,
      { expiresIn: config.auth.accessTokenTtlSeconds }
    )
    const refreshToken = jwt.sign(
      { sub: String(userRow.id), login: userRow.login, type: 'refresh' },
      config.auth.jwtRefreshSecret,
      { expiresIn: config.auth.refreshTokenTtlSeconds }
    )

    const refreshTokenHash = hashRefreshToken(refreshToken)
    await this.pool.query(
      `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)
      `,
      [userRow.id, refreshTokenHash, String(config.auth.refreshTokenTtlSeconds)]
    )

    return {
      accessToken,
      refreshToken,
      expiresIn: config.auth.accessTokenTtlSeconds,
      user: buildPublicUser(userRow)
    }
  }
}

module.exports = {
  AuthService,
  ValidationError,
  ConflictError
}
