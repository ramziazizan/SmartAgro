import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_LIFETIME_SECONDS = 60 * 60

function safeStringEqual(left, right) {
  const leftHash = createHmac('sha256', 'smart-agro-credential-check').update(left).digest()
  const rightHash = createHmac('sha256', 'smart-agro-credential-check').update(right).digest()
  return timingSafeEqual(leftHash, rightHash) && left === right
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function verifyDashboardCredentials(username, password, config) {
  return config.authConfigured &&
    safeStringEqual(username, config.dashboardUsername) &&
    safeStringEqual(password, config.dashboardPassword)
}

export function createAccessToken(username, secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000)
  const payload = encode({
    sub: username,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  })
  const signature = sign(payload, secret)
  return `${payload}.${signature}`
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  const expectedSignature = sign(payload, secret)
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const nowSeconds = Math.floor(now / 1000)
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= nowSeconds
    ) {
      return null
    }
    return claims
  } catch {
    return null
  }
}
