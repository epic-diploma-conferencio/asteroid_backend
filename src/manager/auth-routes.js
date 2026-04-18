const express = require('express')
const config = require('../shared/config')
const { ConflictError, ValidationError } = require('./auth-service')

function createAuthRouter({ authService }) {
  const router = express.Router()

  router.post('/register', async (req, res) => {
    try {
      const authResult = await authService.register(req.body)
      res.cookie(config.auth.refreshCookieName, authResult.refreshToken, {
        httpOnly: true,
        secure: config.auth.cookieSecure,
        sameSite: 'lax',
        domain: config.auth.cookieDomain,
        maxAge: config.auth.refreshTokenTtlSeconds * 1000,
        path: '/'
      })

      return res.json({
        accessToken: authResult.accessToken,
        expiresIn: authResult.expiresIn,
        user: authResult.user
      })
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message })
      }
      if (error instanceof ConflictError) {
        return res.status(409).json({ message: error.message })
      }
      return res.status(500).json({ message: 'Internal server error' })
    }
  })

  return router
}

module.exports = {
  createAuthRouter
}
