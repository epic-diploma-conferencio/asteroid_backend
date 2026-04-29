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

class UnauthorizedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase()
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

function signAccess(userRow) {
  return jwt.sign(
    { sub: String(userRow.id), login: userRow.login, type: 'access' },
    config.auth.jwtAccessSecret,
    { expiresIn: config.auth.accessTokenTtlSeconds }
  )
}

function signRefresh(userRow) {
  return jwt.sign(
    { sub: String(userRow.id), login: userRow.login, type: 'refresh' },
    config.auth.jwtRefreshSecret,
    { expiresIn: config.auth.refreshTokenTtlSeconds }
  )
}

function assertRegisterPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Request body must be a JSON object.')
  }

  const login = normalizeLogin(payload.login)
  const password = String(payload.password || '')
  const firstName = String(payload.firstName || '').trim() || login
  const lastName = String(payload.lastName || '').trim() || login

  if (!login || login.length < 3 || login.length > 32) {
    throw new ValidationError('Field "login" must be between 3 and 32 characters.')
  }
  if (!password || password.length < 8 || password.length > 72) {
    throw new ValidationError('Field "password" must be between 8 and 72 characters.')
  }

  return { login, password, firstName, lastName }
}

class AuthService {
  constructor(pool) {
    this.pool = pool
  }

  async issueTokensForUser(userRow) {
    const accessToken = signAccess(userRow)
    const refreshToken = signRefresh(userRow)
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

    return this.issueTokensForUser(userRow)
  }

  async login(payload) {
    const login = normalizeLogin(payload?.login)
    const password = String(payload?.password || '')
    if (!login || !password) {
      throw new ValidationError('Fields "login" and "password" are required.')
    }

    const result = await this.pool.query(
      'SELECT id, login, first_name, last_name, avatar_url, password_hash FROM users WHERE login = $1',
      [login]
    )

    const user = result.rows[0]
    if (!user) {
      throw new UnauthorizedError('Invalid credentials.')
    }

    const matched = await bcrypt.compare(password, user.password_hash)
    if (!matched) {
      throw new UnauthorizedError('Invalid credentials.')
    }

    return this.issueTokensForUser(user)
  }

  async refresh(rawRefreshToken) {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token is required.')
    }

    let payload
    try {
      payload = jwt.verify(rawRefreshToken, config.auth.jwtRefreshSecret)
    } catch {
      throw new UnauthorizedError('Invalid refresh token.')
    }

    const tokenHash = hashRefreshToken(rawRefreshToken)
    const tokenResult = await this.pool.query(
      `
      SELECT rt.user_id, u.login, u.first_name, u.last_name, u.avatar_url, u.id
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1 AND rt.expires_at > NOW()
      `,
      [tokenHash]
    )

    const row = tokenResult.rows[0]
    if (!row || String(row.user_id) !== String(payload.sub)) {
      throw new UnauthorizedError('Refresh token expired or revoked.')
    }

    await this.pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])
    return this.issueTokensForUser(row)
  }

  async logout(rawRefreshToken) {
    if (!rawRefreshToken) {
      return { ok: true }
    }

    const tokenHash = hashRefreshToken(rawRefreshToken)
    await this.pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])
    return { ok: true }
  }

  async me(userId) {
    if (!userId) {
      throw new UnauthorizedError('Unauthorized')
    }

    const result = await this.pool.query(
      'SELECT id, login, first_name, last_name, avatar_url FROM users WHERE id = $1',
      [userId]
    )

    const user = result.rows[0]
    if (!user) {
      throw new UnauthorizedError('Unauthorized')
    }

    return buildPublicUser(user)
  }
}

module.exports = {
  AuthService,
  ValidationError,
  ConflictError,
  UnauthorizedError
}