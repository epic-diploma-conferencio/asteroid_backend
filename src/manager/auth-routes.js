const express = require('express')
const config = require('../shared/config')
const { ConflictError, ValidationError, UnauthorizedError } = require('./auth-service')
const { getUserFromRequest } = require('./auth-utils')

function getCookieValue(req, cookieName) {
  const header = req.headers.cookie
  if (!header) return null
  const parts = header.split(';').map(part => part.trim())
  for (const part of parts) {
    if (part.startsWith(`${cookieName}=`)) {
      return decodeURIComponent(part.slice(cookieName.length + 1))
    }
  }
  return null
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(config.auth.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    domain: config.auth.cookieDomain,
    maxAge: config.auth.refreshTokenTtlSeconds * 1000,
    path: '/'
  })
}

function clearRefreshCookie(res) {
  res.clearCookie(config.auth.refreshCookieName, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    domain: config.auth.cookieDomain,
    path: '/'
  })
}

function createAuthRouter({ authService }) {
  const router = express.Router()

  router.post('/register', async (req, res) => {
    try {
      const authResult = await authService.register(req.body)
      setRefreshCookie(res, authResult.refreshToken)
      return res.json({
        accessToken: authResult.accessToken,
        expiresIn: authResult.expiresIn,
        user: authResult.user
      })
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ message: error.message })
      if (error instanceof ConflictError) return res.status(409).json({ message: error.message })
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  router.post('/login', async (req, res) => {
    try {
      const authResult = await authService.login(req.body)
      setRefreshCookie(res, authResult.refreshToken)
      return res.json({
        accessToken: authResult.accessToken,
        expiresIn: authResult.expiresIn,
        user: authResult.user
      })
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ message: error.message })
      if (error instanceof UnauthorizedError) return res.status(401).json({ message: error.message })
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  router.post('/refresh', async (req, res) => {
    try {
      const refreshToken = getCookieValue(req, config.auth.refreshCookieName)
      const authResult = await authService.refresh(refreshToken)
      setRefreshCookie(res, authResult.refreshToken)
      return res.json({
        accessToken: authResult.accessToken,
        expiresIn: authResult.expiresIn,
        user: authResult.user
      })
    } catch (error) {
      if (error instanceof UnauthorizedError) return res.status(401).json({ message: error.message })
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  router.post('/logout', async (req, res) => {
    try {
      const refreshToken = getCookieValue(req, config.auth.refreshCookieName)
      await authService.logout(refreshToken)
      clearRefreshCookie(res)
      return res.json({ message: 'Logged out' })
    } catch {
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  router.get('/me', async (req, res) => {
    try {
      const user = getUserFromRequest(req)
      const profile = await authService.me(user?.id)
      return res.json(profile)
    } catch (error) {
      if (error instanceof UnauthorizedError) return res.status(401).json({ message: error.message })
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  return router
}

module.exports = {
  createAuthRouter
}
