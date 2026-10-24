const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const API_BASE_URL = (
  /^https?:\/\//i.test(configuredApiBaseUrl)
    ? configuredApiBaseUrl
    : `https://${configuredApiBaseUrl}`
).replace(/\/+$/, '')

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Backend tidak dapat dijangkau. Periksa alamat API dan koneksi.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `API mengembalikan HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

export function getMqttApiHealth() {
  return request('/api/health')
}

export function logInToMqttApi(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function getMqttDeviceStatus(token) {
  return request('/api/device/status', { token })
}

export function getMqttDeviceTelemetry(token) {
  return request('/api/device/telemetry', { token })
}

export function sendMqttPumpCommand(token, command) {
  if (command !== 'ON' && command !== 'OFF') {
    throw new Error('Perintah pompa harus ON atau OFF')
  }
  return request('/api/device/pump', {
    method: 'POST',
    token,
    body: JSON.stringify({ command }),
  })
}
