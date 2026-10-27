import 'dotenv/config'
import { readConfig } from './config.js'
import { createApp } from './app.js'
import { createMqttBridge } from './mqttBridge.js'

const config = readConfig()
const bridge = createMqttBridge(config)
const app = createApp(config, bridge)
const server = app.listen(config.port, () => {
  console.log(`Smart Agro API berjalan di port ${config.port}`)
  if (!config.authConfigured) {
    console.error('Login dashboard belum aktif: lengkapi DASHBOARD_USERNAME, DASHBOARD_PASSWORD, AUTH_TOKEN_SECRET.')
  }
  if (!config.mqttConfigured) {
    console.error('MQTT belum aktif: lengkapi MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD.')
  }
})

function shutdown() {
  server.close(() => {
    bridge.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
