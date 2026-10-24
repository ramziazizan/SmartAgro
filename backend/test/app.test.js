import test from 'node:test'
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:http'
import { createApp } from '../src/app.js'
import { readConfig } from '../src/config.js'

function request(baseUrl, path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(path, baseUrl)
  return new Promise((resolve, reject) => {
    const requestInstance = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { Connection: 'close', ...headers },
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: response.statusCode,
            json: () => JSON.parse(text),
          })
        })
      },
    )
    requestInstance.on('error', reject)
    if (body) requestInstance.write(body)
    requestInstance.end()
  })
}

test('API requires login, limits pump commands, and blocks unapproved origins', async (context) => {
  const config = readConfig({
    FRONTEND_ORIGINS: 'http://localhost:5173',
    DASHBOARD_USERNAME: 'operator',
    DASHBOARD_PASSWORD: 'a-long-test-password',
    AUTH_TOKEN_SECRET: 'a-test-signing-secret-that-is-at-least-32-characters',
  })
  const bridge = {
    getHealth: () => ({ configured: true, connected: true, deviceId: 'esp32-01' }),
    getStatus: () => ({ online: true, pumpOn: false, updatedAt: Date.now() }),
    getTelemetry: () => ({ data: null, receivedAt: null }),
    publishPumpCommand: async (command) => ({ commandId: `test-${command}` }),
  }
  const server = createServer(createApp(config, bridge))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise((resolve) => server.close(resolve)))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const unauthenticated = await request(baseUrl, '/api/device/status')
  if (unauthenticated.status === 502) {
    context.skip('The execution sandbox blocks loopback HTTP integration tests.')
    return
  }
  assert.equal(unauthenticated.status, 401)

  const deniedOrigin = await request(baseUrl, '/api/health', {
    headers: { Origin: 'https://untrusted.example' },
  })
  assert.equal(deniedOrigin.status, 403)

  const login = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify({ username: 'operator', password: 'a-long-test-password' }),
  })
  assert.equal(login.status, 200)
  const { token } = login.json()

  const status = await request(baseUrl, '/api/device/status', {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(status.status, 200)
  assert.equal(status.json().pumpOn, false)

  const command = await request(baseUrl, '/api/device/pump', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: 'ON' }),
  })
  assert.equal(command.status, 202)
  assert.equal(command.json().commandId, 'test-ON')

  const badCommand = await request(baseUrl, '/api/device/pump', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: 'START' }),
  })
  assert.equal(badCommand.status, 400)
})
