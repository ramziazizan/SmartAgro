import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createMqttBridge } from '../src/mqttBridge.js'

function createFakeClient() {
  const client = new EventEmitter()
  client.subscriptions = []
  client.published = []
  client.subscribe = (topics, options, callback) => {
    client.subscriptions.push({ topics, options })
    callback(null)
  }
  client.publish = (topic, payload, options, callback) => {
    client.published.push({ topic, payload, options })
    callback(null)
  }
  client.end = () => {}
  return client
}

const config = {
  mqttConfigured: true,
  mqttBrokerUrl: 'mqtts://broker.example.test:8883',
  mqttUsername: 'backend-user',
  mqttPassword: 'backend-password',
  mqttClientId: 'test-backend',
  mqttTopicPrefix: 'smartagro',
  mqttDeviceId: 'esp32-01',
}

test('bridge subscribes to device topics and publishes pump commands without retaining them', async () => {
  const fakeClient = createFakeClient()
  let connectionOptions
  const bridge = createMqttBridge(config, (_url, options) => {
    connectionOptions = options
    return fakeClient
  })

  fakeClient.emit('connect')
  assert.equal(connectionOptions.rejectUnauthorized, true)
  assert.deepEqual(fakeClient.subscriptions[0].topics, [
    'smartagro/esp32-01/status/pump',
    'smartagro/esp32-01/telemetry',
  ])

  fakeClient.emit(
    'message',
    'smartagro/esp32-01/status/pump',
    Buffer.from(JSON.stringify({ pumpOn: true, updatedAt: Date.now() })),
  )
  assert.equal(bridge.getStatus().online, true)
  assert.equal(bridge.getStatus().pumpOn, true)

  fakeClient.emit(
    'message',
    'smartagro/esp32-01/telemetry',
    Buffer.from(JSON.stringify({ moisture: 34, deviceId: 'esp32-01' })),
  )
  assert.equal(bridge.getTelemetry().data.moisture, 34)

  await bridge.publishPumpCommand('ON')
  assert.equal(fakeClient.published[0].topic, 'smartagro/esp32-01/command/pump')
  assert.equal(fakeClient.published[0].payload, 'ON')
  assert.equal(fakeClient.published[0].options.qos, 1)
  assert.equal(fakeClient.published[0].options.retain, false)
  bridge.close()
})

test('bridge marks stale status offline and rejects publish while disconnected', async () => {
  const fakeClient = createFakeClient()
  const bridge = createMqttBridge(config, () => fakeClient)
  fakeClient.emit('connect')
  fakeClient.emit(
    'message',
    'smartagro/esp32-01/status/pump',
    Buffer.from(JSON.stringify({ pumpOn: false })),
  )

  assert.equal(bridge.getStatus(Date.now() + 21_000).online, false)
  fakeClient.emit('close')
  assert.throws(() => bridge.publishPumpCommand('OFF'), /belum terhubung/)
  assert.throws(() => bridge.publishPumpCommand('START'), /harus ON atau OFF/)
  bridge.close()
})

test('bridge keeps device online when pump state is unknown and handles explicit offline status', () => {
  const fakeClient = createFakeClient()
  const bridge = createMqttBridge(config, () => fakeClient)
  fakeClient.emit('connect')

  fakeClient.emit(
    'message',
    'smartagro/esp32-01/status/pump',
    Buffer.from(JSON.stringify({ online: true, pumpOn: null, updatedAt: Date.now() })),
  )

  assert.equal(bridge.getStatus().online, true)
  assert.equal(bridge.getStatus().pumpOn, null)

  fakeClient.emit(
    'message',
    'smartagro/esp32-01/status/pump',
    Buffer.from(JSON.stringify({ online: false, pumpOn: null, updatedAt: Date.now() })),
  )

  assert.equal(bridge.getStatus().online, false)
  assert.equal(bridge.getStatus().pumpOn, null)
  bridge.close()
})
