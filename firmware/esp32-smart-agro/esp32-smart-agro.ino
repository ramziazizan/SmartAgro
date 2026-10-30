#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

const char* MQTT_CLIENT_ID = "esp32-smart-agro-01";

const char* TOPIC_COMMAND = "smartagro/esp32-01/command/pump";
const char* TOPIC_PUMP_STATUS = "smartagro/esp32-01/status/pump";

constexpr uint8_t PUMP_PINS[] = {27, 26, 32, 33};
constexpr size_t PUMP_COUNT = sizeof(PUMP_PINS) / sizeof(PUMP_PINS[0]);
constexpr bool RELAY_ACTIVE_LOW = true;

constexpr unsigned long MAX_PUMP_RUN_MS = 30UL * 60UL * 1000UL;
constexpr unsigned long STATUS_INTERVAL_MS = 5000UL;

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

bool pumpOn = false;
unsigned long pumpStartedAt = 0;
unsigned long lastStatusAt = 0;

void publishPumpStatus() {
  if (!mqtt.connected()) return;

  JsonDocument status;
  status["online"] = true;
  status["pumpOn"] = pumpOn;
  status["updatedAt"] = millis();

  char payload[128];
  const size_t length = serializeJson(status, payload, sizeof(payload));
  if (length == 0 || length >= sizeof(payload)) {
    Serial.println("Gagal membuat status pompa");
    return;
  }

  if (!mqtt.publish(TOPIC_PUMP_STATUS, payload, true)) {
    Serial.println("Gagal mengirim status pompa");
  }
}

void setAllPumps(bool shouldTurnOn) {
  if (shouldTurnOn && !pumpOn) {
    pumpStartedAt = millis();
  }

  pumpOn = shouldTurnOn;
  const uint8_t relayLevel = RELAY_ACTIVE_LOW
    ? (pumpOn ? LOW : HIGH)
    : (pumpOn ? HIGH : LOW);

  for (size_t i = 0; i < PUMP_COUNT; i++) {
    digitalWrite(PUMP_PINS[i], relayLevel);
  }

  Serial.printf("Semua pompa: %s\n", pumpOn ? "ON" : "OFF");
  publishPumpStatus();
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, TOPIC_COMMAND) != 0) return;

  String command;
  command.reserve(length);
  for (unsigned int i = 0; i < length; i++) {
    command += static_cast<char>(payload[i]);
  }
  command.trim();

  Serial.printf("Perintah diterima: %s\n", command.c_str());
  if (command == "ON") {
    setAllPumps(true);
  } else if (command == "OFF") {
    setAllPumps(false);
  } else {
    Serial.println("Perintah tidak dikenal; gunakan ON atau OFF");
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Menghubungkan Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi terhubung");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

void connectMqtt() {
  static const char offlineStatus[] = "{\"online\":false,\"pumpOn\":null}";

  while (!mqtt.connected()) {
    Serial.println("Menghubungkan MQTT...");
    const bool connected = mqtt.connect(
      MQTT_CLIENT_ID,
      MQTT_USERNAME,
      MQTT_PASSWORD,
      TOPIC_PUMP_STATUS,
      1,
      true,
      offlineStatus
    );

    if (connected) {
      Serial.println("MQTT terhubung");
      if (mqtt.subscribe(TOPIC_COMMAND, 1)) {
        Serial.printf("Subscribe berhasil: %s\n", TOPIC_COMMAND);
      } else {
        Serial.println("Subscribe topic perintah gagal; periksa izin MQTT");
      }
      publishPumpStatus();
      lastStatusAt = millis();
    } else {
      Serial.printf("MQTT gagal, kode: %d\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  const uint8_t relayOffLevel = RELAY_ACTIVE_LOW ? HIGH : LOW;
  for (size_t i = 0; i < PUMP_COUNT; i++) {
    pinMode(PUMP_PINS[i], OUTPUT);
    digitalWrite(PUMP_PINS[i], relayOffLevel);
  }
  pumpOn = false;

  connectWiFi();

  // For development only. Production firmware should verify the broker CA.
  secureClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);

  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  const unsigned long now = millis();
  if (pumpOn && now - pumpStartedAt >= MAX_PUMP_RUN_MS) {
    Serial.println("Batas waktu tercapai, semua pompa dimatikan");
    setAllPumps(false);
  }

  if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
    lastStatusAt = now;
    publishPumpStatus();
  }
}
