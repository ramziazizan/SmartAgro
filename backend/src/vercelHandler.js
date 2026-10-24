import { randomUUID } from 'node:crypto'
import mqtt from 'mqtt'
import { createAccessToken, verifyAccessToken, verifyDashboardCredentials } from './auth.js'
import { readConfig } from './config.js'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LIMIT = 10
const COMMAND_WINDOW_MS = 60 * 1000
const COMMAND_LIMIT = 10
const RATE_LIMIT_BUCKETS = new Map()

function getRequestBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body)
    } catch {
      return null
    }
  }
  return null
}

function getClientKey(request) {
  const forwardedFor = request.headers['x-forwarded-for']
  return typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : request.socket.remoteAddress || 'unknown'
}

function allowRateLimit(key, limit, windowMs, now = Date.now()) {
  const current = RATE_LIMIT_BUCKETS.get(key)
  if (!current || current.resetAt <= now) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

function isAllowedOrigin(request, config) {
  const origin = request.headers.origin
  if (!origin) return true
  const allowed = new Set(config.frontendOrigins)
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowed.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  return allowed.has(origin)
}

function createMqttClient(config) {
  const clientId = `${config.mqttClientId}-${randomUUID().slice(0, 8)}`.slice(0, 64)
  return mqtt.connect(config.mqttBrokerUrl, {
    clientId,
    username: config.mqttUsername,
    password: config.mqttPassword,
    protocolVersion: 4,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 0,
    rejectUnauthorized: true,
  })
}

function withMqtt(config, operation) {
  if (!config.mqttConfigured) {
    return Promise.reject(new Error('Konfigurasi MQTT backend belum lengkap.'))
  }

  return new Promise((resolve, reject) => {
    const client = createMqttClient(config)
    let finished = false
    let settleOperation
    const connectTimeout = setTimeout(() => {
      finish(new Error('Koneksi ke broker MQTT timeout.'))
    }, 10_000)

    const finish = (error, result) => {
      if (finished) return
      finished = true
      clearTimeout(connectTimeout)
      if (settleOperation) clearTimeout(settleOperation)
      client.end(true)
      if (error) reject(error)
      else resolve(result)
    }

    client.once('error', (error) => {
      finish(new Error(`Koneksi broker MQTT gagal: ${error.message}`))
    })

    client.once('connect', async () => {
      try {
        const result = await operation(client, (timer) => {
          settleOperation = timer
        })
        finish(null, result)
      } catch (error) {
        finish(error)
      }
    })
  })
}

function readRetainedDeviceData(config) {
  const root = `${config.mqttTopicPrefix}/${config.mqttDeviceId}`
  const topics = {
    status: `${root}/status/pump`,
    telemetry: `${root}/telemetry`,
  }

  return withMqtt(config, (client, setSettleTimer) => new Promise((resolve, reject) => {
    const messages = new Map()
    client.on('message', (topic, payload) => {
      try {
        messages.set(topic, JSON.parse(payload.toString('utf8')))
      } catch {
        console.error(`Retained MQTT JSON tidak valid pada topic ${topic}`)
      }
    })

    client.subscribe([topics.status, topics.telemetry], { qos: 1 }, (error) => {
      if (error) {
        reject(new Error('Gagal subscribe ke topic status/telemetry MQTT.'))
        return
      }
      setSettleTimer(setTimeout(() => resolve(messages), 350))
    })
  }))
}

function getTelemetryTimestamp(telemetry) {
  const timestamp = telemetry?.timestamp ?? telemetry?.updatedAt
  if (typeof timestamp === 'number') {
    return timestamp >= 1_000_000_000_000 ? timestamp : null
  }
  if (typeof timestamp === 'string' && timestamp.trim()) {
    const parsed = Date.parse(timestamp)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function publishPumpCommand(config, command) {
  const topic = `${config.mqttTopicPrefix}/${config.mqttDeviceId}/command/pump`
  const commandId = randomUUID()
  return withMqtt(config, (client) => new Promise((resolve, reject) => {
    client.publish(topic, command, { qos: 1, retain: false }, (error) => {
      if (error) {
        reject(new Error('Gagal mengirim perintah ke broker MQTT.'))
        return
      }
      resolve({ commandId })
    })
  }))
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

export default async function handler(request, response) {
  const config = readConfig()
  const path = new URL(request.url, 'https://vercel.invalid').pathname.replace(/\/+$/, '')

  response.setHeader('Vary', 'Origin')
  if (request.headers.origin && isAllowedOrigin(request, config)) {
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin)
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
    response.setHeader('Access-Control-Max-Age', '600')
  } else if (request.headers.origin) {
    sendJson(response, 403, { error: 'Origin tidak diizinkan' })
    return
  }

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (path === '/api/health' && request.method === 'GET') {
    try {
      await withMqtt(config, async () => true)
      sendJson(response, 200, {
        api: 'ok',
        mqtt: { configured: true, connected: true, deviceId: config.mqttDeviceId },
      })
    } catch {
      sendJson(response, 200, {
        api: 'ok',
        mqtt: { configured: config.mqttConfigured, connected: false, deviceId: config.mqttDeviceId },
      })
    }
    return
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    if (!allowRateLimit(`login:${getClientKey(request)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
      sendJson(response, 429, { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' })
      return
    }
    if (!config.authConfigured) {
      sendJson(response, 503, { error: 'Autentikasi backend belum dikonfigurasi.' })
      return
    }

    const body = getRequestBody(request)
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      sendJson(response, 400, { error: 'Username dan password wajib diisi.' })
      return
    }
    if (!verifyDashboardCredentials(body.username, body.password, config)) {
      sendJson(response, 401, { error: 'Username atau password salah.' })
      return
    }

    sendJson(response, 200, {
      token: createAccessToken(body.username, config.tokenSecret),
      expiresIn: 3600,
    })
    return
  }

  if (path.startsWith('/api/device/')) {
    const authorization = request.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!verifyAccessToken(token, config.tokenSecret)) {
      sendJson(response, 401, { error: 'Sesi tidak valid atau sudah kedaluwarsa. Login kembali.' })
      return
    }

    try {
      if (
        (path === '/api/device/status' || path === '/api/device/snapshot') &&
        request.method === 'GET'
      ) {
        const retained = await readRetainedDeviceData(config)
        const state = retained.get(`${config.mqttTopicPrefix}/${config.mqttDeviceId}/status/pump`)
        const online = Boolean(
          state &&
          typeof state === 'object' &&
          state.online !== false &&
          (typeof state.pumpOn === 'boolean' || state.pumpOn === null),
        )
        const status = {
          online,
          pumpOn: online && typeof state.pumpOn === 'boolean' ? state.pumpOn : null,
          updatedAt: online && Number.isFinite(Number(state.updatedAt)) ? Number(state.updatedAt) : null,
        }
        if (path === '/api/device/status') {
          sendJson(response, 200, status)
          return
        }

        const telemetry = retained.get(`${config.mqttTopicPrefix}/${config.mqttDeviceId}/telemetry`)
        const telemetryTimestamp = getTelemetryTimestamp(telemetry)
        const telemetryFresh =
          telemetryTimestamp !== null && Date.now() - telemetryTimestamp <= 60_000
        sendJson(response, 200, {
          ...status,
          telemetry: telemetryFresh ? telemetry : null,
          telemetryReceivedAt: telemetryFresh ? telemetryTimestamp : null,
        })
        return
      }

      if (path === '/api/device/telemetry' && request.method === 'GET') {
        const retained = await readRetainedDeviceData(config)
        const telemetry = retained.get(`${config.mqttTopicPrefix}/${config.mqttDeviceId}/telemetry`)
        const telemetryTimestamp = getTelemetryTimestamp(telemetry)
        const telemetryFresh =
          telemetryTimestamp !== null && Date.now() - telemetryTimestamp <= 60_000
        sendJson(response, 200, {
          data: telemetryFresh ? telemetry : null,
          receivedAt: telemetryFresh ? telemetryTimestamp : null,
        })
        return
      }

      if (path === '/api/device/pump' && request.method === 'POST') {
        if (!allowRateLimit(`pump:${getClientKey(request)}`, COMMAND_LIMIT, COMMAND_WINDOW_MS)) {
          sendJson(response, 429, { error: 'Terlalu banyak perintah pompa. Tunggu sebentar sebelum mencoba lagi.' })
          return
        }
        const body = getRequestBody(request)
        if (body?.command !== 'ON' && body?.command !== 'OFF') {
          sendJson(response, 400, { error: 'Perintah pompa harus ON atau OFF.' })
          return
        }
        const retained = await readRetainedDeviceData(config)
        const state = retained.get(`${config.mqttTopicPrefix}/${config.mqttDeviceId}/status/pump`)
        if (!state || typeof state !== 'object' || state.online === false) {
          sendJson(response, 503, { error: 'ESP32 sedang offline; perintah tidak dikirim.' })
          return
        }
        const result = await publishPumpCommand(config, body.command)
        sendJson(response, 202, { accepted: true, command: body.command, ...result })
        return
      }
    } catch (error) {
      console.error('Permintaan MQTT gagal:', error.message)
      sendJson(response, 503, { error: 'Koneksi atau operasi MQTT gagal. Periksa konfigurasi broker.' })
      return
    }
  }

  sendJson(response, 404, { error: 'Endpoint tidak ditemukan.' })
}
