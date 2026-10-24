import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../src/vercelHandler.js'

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body = '') {
      this.body = body
    },
  }
}

function createRequest({ method = 'GET', path, body, headers = {} }) {
  return {
    method,
    url: path,
    headers,
    body,
    socket: { remoteAddress: '127.0.0.1' },
  }
}

test('Vercel API creates dashboard tokens and rejects unauthenticated device access', async (context) => {
  const originalEnv = {
    DASHBOARD_USERNAME: process.env.DASHBOARD_USERNAME,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET,
  }
  process.env.DASHBOARD_USERNAME = 'test-operator'
  process.env.DASHBOARD_PASSWORD = 'test-dashboard-password'
  process.env.AUTH_TOKEN_SECRET = 'test-signing-secret-with-at-least-32-characters'
  context.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const loginResponse = createResponse()
  await handler(
    createRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'test-operator', password: 'test-dashboard-password' },
    }),
    loginResponse,
  )

  assert.equal(loginResponse.statusCode, 200)
  assert.equal(typeof JSON.parse(loginResponse.body).token, 'string')

  const protectedResponse = createResponse()
  await handler(
    createRequest({ path: '/api/device/snapshot' }),
    protectedResponse,
  )

  assert.equal(protectedResponse.statusCode, 401)
})
