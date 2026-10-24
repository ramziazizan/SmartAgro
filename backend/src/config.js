const MQTT_URL_PATTERN = /^mqtts:\/\/[^/]+$/i

export function readConfig(env = process.env) {
  const origins = (env.FRONTEND_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const brokerUrl = env.MQTT_BROKER_URL?.trim() || ''
  const mqttUsername = env.MQTT_USERNAME || ''
  const mqttPassword = env.MQTT_PASSWORD || ''
  const dashboardUsername = env.DASHBOARD_USERNAME || ''
  const dashboardPassword = env.DASHBOARD_PASSWORD || ''
  const tokenSecret = env.AUTH_TOKEN_SECRET || ''
  const topicPartsAreValid = [env.MQTT_TOPIC_PREFIX || 'smartagro', env.MQTT_DEVICE_ID || 'esp32-01']
    .every((part) => /^[a-zA-Z0-9_-]+$/.test(part))

  return {
    port: Number(env.PORT) || 3001,
    frontendOrigins: origins,
    mqttBrokerUrl: brokerUrl,
    mqttUsername,
    mqttPassword,
    mqttClientId: env.MQTT_CLIENT_ID?.trim() || 'smart-agro-backend',
    mqttTopicPrefix: env.MQTT_TOPIC_PREFIX?.trim() || 'smartagro',
    mqttDeviceId: env.MQTT_DEVICE_ID?.trim() || 'esp32-01',
    dashboardUsername,
    dashboardPassword,
    tokenSecret,
    mqttConfigured:
      MQTT_URL_PATTERN.test(brokerUrl) &&
      Boolean(mqttUsername) &&
      Boolean(mqttPassword) &&
      topicPartsAreValid,
    authConfigured:
      Boolean(dashboardUsername) &&
      dashboardPassword.length >= 12 &&
      tokenSecret.length >= 32,
  }
}
