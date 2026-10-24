import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAccessToken,
  verifyAccessToken,
  verifyDashboardCredentials,
} from '../src/auth.js'
import { readConfig } from '../src/config.js'

const config = readConfig({
  DASHBOARD_USERNAME: 'operator',
  DASHBOARD_PASSWORD: 'a-long-test-password',
  AUTH_TOKEN_SECRET: 'a-test-signing-secret-that-is-at-least-32-characters',
})

test('dashboard credentials are compared and require a configured strong secret', () => {
  assert.equal(verifyDashboardCredentials('operator', 'a-long-test-password', config), true)
  assert.equal(verifyDashboardCredentials('operator', 'wrong-password', config), false)
  assert.equal(verifyDashboardCredentials('other', 'a-long-test-password', config), false)

  const weakConfig = readConfig({
    DASHBOARD_USERNAME: 'operator',
    DASHBOARD_PASSWORD: 'short',
    AUTH_TOKEN_SECRET: 'short',
  })
  assert.equal(verifyDashboardCredentials('operator', 'short', weakConfig), false)
})

test('access tokens are signed, expire, and reject tampering', () => {
  const issuedAt = 1_800_000_000_000
  const token = createAccessToken('operator', config.tokenSecret, issuedAt)

  assert.equal(verifyAccessToken(token, config.tokenSecret, issuedAt)?.sub, 'operator')
  assert.equal(verifyAccessToken(`${token}x`, config.tokenSecret, issuedAt), null)
  assert.equal(verifyAccessToken(token, 'a-different-signing-secret', issuedAt), null)
  assert.equal(
    verifyAccessToken(token, config.tokenSecret, issuedAt + 60 * 60 * 1000),
    null,
  )
})
