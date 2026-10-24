import { randomUUID } from 'node:crypto'
import mqtt from 'mqtt'

const DEVICE_ONLINE_WINDOW_MS = 20_000

function parseJsonMessage(payload) {
  try {
    return JSON.parse(payload.toString('utf8'))
  } catch {
    return null
  }
}

export function createMqttBridge(config, connect = mqtt.connect) {
  const state = {
    connected: false,
    pumpOn: null,
    statusUpdatedAt: null,
    statusReceivedAt: null,
    telemetry: null,
    telemetryReceivedAt: null,
    lastError: null,
  }
  const prefix = `${config.mqttTopicPrefix}/${config.mqttDeviceId}`
  const topics = {
    command: `${prefix}/command/pump`,
    status: `${prefix}/status/pump`,
    telemetry: `${prefix}/telemetry`,
  }
  let client = null

  if (config.mqttConfigured) {
    client = connect(config.mqttBrokerUrl, {
      clientId: config.mqttClientId,
      username: config.mqttUsername,
      password: config.mqttPassword,
      protocolVersion: 4,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: 3000,
      rejectUnauthorized: true,
    })

    client.on('connect', () => {
      state.connected = true
      state.lastError = null
      client.subscribe([topics.status, topics.telemetry], { qos: 1 }, (error) => {
        if (error) {
          state.lastError = 'Gagal subscribe ke topic status/telemetry'
          console.error(state.lastError, error.message)
        }
      })
    })

    client.on('reconnect', () => {
      state.connected = false
    })

    client.on('close', () => {
      state.connected = false
    })

    client.on('error', (error) => {
      state.connected = false
      state.lastError = 'Koneksi broker MQTT bermasalah'
      console.error(state.lastError, error.message)
    })

    client.on('message', (topic, payload) => {
      const message = parseJsonMessage(payload)
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        console.error(`Pesan MQTT JSON tidak valid pada topic ${topic}`)
        return
      }

      if (topic === topics.status) {
        if (message.online === false) {
          state.pumpOn = null
          state.statusUpdatedAt =
            Number.isFinite(Number(message.updatedAt)) ? Number(message.updatedAt) : Date.now()
          state.statusReceivedAt = null
          return
        }

        const validPumpState = typeof message.pumpOn === 'boolean' || message.pumpOn === null
        if (!validPumpState) {
          console.error('Pesan status MQTT wajib memiliki pumpOn boolean atau null')
          return
        }

        state.pumpOn = message.pumpOn
        state.statusUpdatedAt =
          Number.isFinite(Number(message.updatedAt)) ? Number(message.updatedAt) : Date.now()
        state.statusReceivedAt = Date.now()
      } else if (topic === topics.telemetry) {
        state.telemetry = message
        state.telemetryReceivedAt = Date.now()
      }
    })
  }

  return {
    getHealth() {
      return {
        configured: config.mqttConfigured,
        connected: state.connected,
        deviceId: config.mqttDeviceId,
      }
    },

    getStatus(now = Date.now()) {
      const online =
        state.statusReceivedAt !== null &&
        now - state.statusReceivedAt <= DEVICE_ONLINE_WINDOW_MS
      return {
        online,
        pumpOn: state.pumpOn,
        updatedAt: state.statusUpdatedAt,
      }
    },

    getTelemetry(now = Date.now()) {
      const fresh = state.telemetryReceivedAt !== null &&
        now - state.telemetryReceivedAt <= 60_000
      return {
        data: fresh ? state.telemetry : null,
        receivedAt: state.telemetryReceivedAt,
      }
    },

    publishPumpCommand(command) {
      if (command !== 'ON' && command !== 'OFF') {
        throw new Error('Perintah pompa harus ON atau OFF')
      }
      if (!client || !state.connected) {
        throw new Error('Broker MQTT belum terhubung')
      }

      const commandId = randomUUID()
      return new Promise((resolve, reject) => {
        client.publish(topics.command, command, { qos: 1, retain: false }, (error) => {
          if (error) {
            reject(new Error('Gagal mengirim perintah ke broker MQTT'))
            return
          }
          resolve({ commandId })
        })
      })
    },

    close() {
      if (client) client.end(true)
    },
  }
}
