import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import {
  createAccessToken,
  verifyAccessToken,
  verifyDashboardCredentials,
} from './auth.js'

export function createApp(config, bridge) {
  const app = express()
  const allowedOrigins = new Set(config.frontendOrigins)

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Origin tidak diizinkan'))
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }))
  app.use(express.json({ limit: '8kb', strict: true }))

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
  })
  const pumpCommandLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak perintah pompa. Tunggu sebentar sebelum mencoba lagi.' },
  })

  app.get('/api/health', (_request, response) => {
    response.json({ api: 'ok', mqtt: bridge.getHealth() })
  })

  app.post('/api/auth/login', loginLimiter, (request, response) => {
    if (!config.authConfigured) {
      response.status(503).json({ error: 'Autentikasi backend belum dikonfigurasi.' })
      return
    }

    const { username, password } = request.body || {}
    if (typeof username !== 'string' || typeof password !== 'string') {
      response.status(400).json({ error: 'Username dan password wajib diisi.' })
      return
    }

    if (!verifyDashboardCredentials(username, password, config)) {
      response.status(401).json({ error: 'Username atau password salah.' })
      return
    }

    response.json({
      token: createAccessToken(username, config.tokenSecret),
      expiresIn: 3600,
    })
  })

  app.use('/api/device', (request, response, next) => {
    const authorization = request.get('authorization') || ''
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : ''
    const claims = verifyAccessToken(token, config.tokenSecret)

    if (!claims) {
      response.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa. Login kembali.' })
      return
    }

    request.user = { username: claims.sub }
    next()
  })

  app.get('/api/device/status', (_request, response) => {
    response.json(bridge.getStatus())
  })

  app.get('/api/device/telemetry', (_request, response) => {
    response.json(bridge.getTelemetry())
  })

  app.post('/api/device/pump', pumpCommandLimiter, async (request, response) => {
    const { command } = request.body || {}
    if (command !== 'ON' && command !== 'OFF') {
      response.status(400).json({ error: 'Perintah pompa harus ON atau OFF.' })
      return
    }

    try {
      const result = await bridge.publishPumpCommand(command)
      response.status(202).json({ accepted: true, command, ...result })
    } catch (error) {
      response.status(503).json({ error: error.message })
    }
  })

  app.use((error, _request, response, _next) => {
    if (error.message === 'Origin tidak diizinkan') {
      response.status(403).json({ error: error.message })
      return
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Body JSON tidak valid.' })
      return
    }
    console.error('API request gagal:', error.message)
    response.status(500).json({ error: 'Terjadi kesalahan pada API.' })
  })

  return app
}
