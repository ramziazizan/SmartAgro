//Lib
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

//wifi

//google sheets
const char* DEVICE_NAME = "ESP32-Soil-01";

//mqtt


const char* TOPIC_DATA   = "smartagro/esp32-01/telemetry";
const char* TOPIC_CMD       = "smartagro/esp32-01/command/pump";     // ON/OFF -> SEMUA channel
const char* TOPIC_CMD_CH    = "smartagro/esp32-01/command/pump/";    // + nomor 1-4 -> satu channel
const char* TOPIC_CMD_SUB   = "smartagro/esp32-01/command/pump/+";  // untuk subscribe
const char* TOPIC_STATUS    = "smartagro/esp32-01/status/pump";      // ringkasan semua channel
const char* TOPIC_STATUS_CH = "smartagro/esp32-01/status/pump/";     // + nomor 1-4

//pompa / relay 4 channel (IN1..IN4)
const uint8_t JUMLAH_POMPA = 4;
const int  PIN_POMPA[JUMLAH_POMPA] = {27, 26, 32, 33};   // ubah di sini jika wiring berbeda
const bool RELAY_ACTIVE_LOW = true;

//LED indikator WiFi (D2 = GPIO2, LED bawaan board)
const int PIN_LED_WIFI = 2;

//interval
const unsigned long MAX_RUN_MS            = 30UL * 60UL * 1000UL;  // batas maks tiap pompa nyala
const unsigned long INTERVAL_SENSOR_MS    = 5000UL;                // baca sensor + OLED
const unsigned long INTERVAL_TELEMETRI_MS = 10000UL;               // kirim MQTT
const unsigned long INTERVAL_STATUS_MS    = 5000UL;                // status pompa
const unsigned long INTERVAL_SHEETS_MS    = 15000UL;               // kirim Google Sheets
const unsigned long INTERVAL_MQTT_RETRY_MS = 5000UL;               // jeda coba konek MQTT
const unsigned long INTERVAL_LAPORAN_MS   = 10000UL;               // laporan status ke Serial Monitor

//RS485
#define USE_REDE   true
#define REDE_PIN   4
#define RX2_PIN    16
#define TX2_PIN    17

// OLED I2C
#define OLED_SDA 21
#define OLED_SCL 22
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(128, 64, &Wire, -1);

//Modbus
const uint8_t  SID  = 0x01;
const uint32_t BAUD = 9600;
const uint32_t UART_CFG = SERIAL_8E1;

const uint16_t REG_PH   = 0x0006;   // ÷100
const uint16_t REG_TEMP = 0x0013;   // ÷10
const uint16_t REG_EC   = 0x0015;   // x1
const uint16_t REG_NPK  = 0x001E;   // 3 regs
const uint16_t REG_MOIS = 0x0012;   // ÷10

HardwareSerial RS(2);

//client
WiFiClientSecure espClient;   // khusus MQTT
PubSubClient mqtt(espClient);

//data sensor terakhir (dipakai OLED, Google Sheets, dan MQTT)
float dPh = NAN, dTemp = NAN, dEc = NAN, dMoist = NAN;
float dN = NAN, dP = NAN, dK = NAN;

//state
unsigned long waktuSensor = 0;
unsigned long waktuData = 0;
unsigned long waktuStatus = 0;
unsigned long waktuSheets = 0;
unsigned long waktuMqttCoba = 0;
unsigned long waktuLaporan = 0;
bool mqttSebelumnya = false;
unsigned long waktuPompa[JUMLAH_POMPA] = {0, 0, 0, 0};
bool pompaOn[JUMLAH_POMPA] = {false, false, false, false};

bool adaPompaOn(){
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) if (pompaOn[i]) return true;
  return false;
}

//CRC & RS485 TX
static inline uint16_t crc16(const uint8_t* b, uint16_t n){
  uint16_t c=0xFFFF;
  for(uint16_t i=0;i<n;i++){
    c^=b[i];
    for(uint8_t j=0;j<8;j++) c=(c&1)?(c>>1)^0xA001:(c>>1);
  }
  return c;
}
static inline void rs485_tx(const uint8_t* d, size_t n){
  if (USE_REDE) digitalWrite(REDE_PIN, HIGH);
  RS.write(d, n);
  RS.flush();
  delayMicroseconds(600);
  if (USE_REDE) digitalWrite(REDE_PIN, LOW);
}
bool readHolding(uint16_t start, uint16_t count, uint16_t* out){
  uint8_t q[8] = {SID,0x03,(uint8_t)(start>>8),(uint8_t)start,0x00,(uint8_t)count,0,0};
  uint16_t c = crc16(q,6);
  q[6]=c&0xFF;
  q[7]=c>>8;
  while(RS.available()) RS.read();
  rs485_tx(q,8);
  uint8_t r[24]; uint16_t n=0; uint32_t t0=millis();
  while(millis()-t0<700){
    while(RS.available()){
      if(n<sizeof(r)) r[n++]=RS.read();
      else (void)RS.read();
    }
    if(n){
      uint32_t last=millis();
      while(millis()-last<25){
        if(RS.available()){
          if(n<sizeof(r)) r[n++]=RS.read();
          else (void)RS.read();
          last=millis();
        }
      }
      break;
    }
  }
  if(n<5) return false;
  uint16_t s=0; while(s+4<n){ if(r[s]==SID && r[s+1]==0x03) break; s++; }
  if(s+5>n) return false;
  if(s){ for(uint16_t i=0;i<n-s;i++) r[i]=r[i+s]; n-=s; }
  uint16_t rx = r[n-2] | (r[n-1]<<8);
  if (rx != crc16(r, n-2)) return false;
  if (r[2] != count*2) return false;
  for(uint16_t i=0;i<count;i++) out[i] = (r[3+2*i]<<8) | r[4+2*i];
  return true;
}

//baca semua sensor tanah ke variabel global
void bacaSensor(){
  uint16_t v[3];
  dPh = dTemp = dEc = dMoist = NAN;
  dN = dP = dK = NAN;

  if(readHolding(REG_PH,1,v))   dPh    = v[0]/100.0f;
  if(readHolding(REG_TEMP,1,v)) dTemp  = v[0]/10.0f;
  if(readHolding(REG_EC,1,v))   dEc    = v[0];
  if(readHolding(REG_MOIS,1,v)) dMoist = v[0]/10.0f;
  if(readHolding(REG_NPK,3,v))  { dN=v[0]; dP=v[1]; dK=v[2]; }
}

//wifi (non-blocking, auto reconnect)
static bool     wifiConnecting=false;
static uint32_t lastAttemptMs=0;
static const uint32_t CONNECT_TIMEOUT_MS=20000;

static uint32_t lastDisconnectMs = 0;

void onWiFiEvent(WiFiEvent_t e, WiFiEventInfo_t info){
  if(e==ARDUINO_EVENT_WIFI_STA_GOT_IP){
    Serial.print("[WiFi] IP: "); Serial.println(WiFi.localIP());
    wifiConnecting=false;
  }
  else if(e==ARDUINO_EVENT_WIFI_STA_DISCONNECTED){
    Serial.printf("[WiFi] Disconnected, reason: %d\n", info.wifi_sta_disconnected.reason);
    wifiConnecting=false;
    lastDisconnectMs=millis();
  }
}
void wifiStartOnce(){
  if(wifiConnecting) return;
  wifiConnecting=true; lastAttemptMs=millis();
  WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setSleep(false);
  Serial.println("[WiFi] Connecting..."); WiFi.begin(WIFI_SSID, WIFI_PASS);
}
void wifiEnsure(){
  if(WiFi.status()==WL_CONNECTED) return;
  if(!wifiConnecting){
    if(millis()-lastDisconnectMs < 5000) return;   // jeda 5 detik sebelum coba lagi
    wifiStartOnce();
    return;
  }
  if(millis()-lastAttemptMs>CONNECT_TIMEOUT_MS){
    Serial.println("[WiFi] Timeout, reset STA"); wifiConnecting=false; WiFi.disconnect(true,true); delay(200); wifiStartOnce();
  }
}

//googlesheet
// Potong teks panjang agar Serial Monitor tetap terbaca
String potong(const String& t, size_t n){
  return t.length() > n ? t.substring(0, n) + "..." : t;
}

// HTTP GET mentah lewat TLS (tanpa HTTPClient).
// Mengembalikan kode status HTTP; "mentah" berisi awal respons apa adanya (untuk debug).
int httpGetRaw(const String& urlLengkap, String& lokasi, String& mentah){
  lokasi = ""; mentah = "";

  int p = urlLengkap.indexOf("://");
  if (p < 0) return -10;
  String sisa = urlLengkap.substring(p + 3);
  int slash = sisa.indexOf('/');
  if (slash < 0) return -11;
  String host = sisa.substring(0, slash);
  String path = sisa.substring(slash);

  WiFiClientSecure c;
  c.setInsecure();
  if (!c.connect(host.c_str(), 443)) return -1;

  c.print(String("GET ") + path + " HTTP/1.1\r\n" +
          "Host: " + host + "\r\n" +
          "User-Agent: ESP32\r\n" +
          "Accept: */*\r\n" +
          "Connection: close\r\n\r\n");

  // Baca respons dengan batas waktu sendiri (maks 10 detik / 900 byte)
  unsigned long t0 = millis();
  while (millis() - t0 < 10000 && mentah.length() < 900) {
    if (c.available()) {
      mentah += (char)c.read();
    } else if (!c.connected()) {
      break;
    } else {
      delay(5);
    }
  }
  c.stop();

  if (mentah.length() < 12) return -2;
  int code = mentah.substring(9, 12).toInt();

  // cari header Location
  int i = mentah.indexOf("\nLocation:");
  if (i < 0) i = mentah.indexOf("\nlocation:");
  if (i >= 0) {
    int e = mentah.indexOf('\n', i + 1);
    lokasi = mentah.substring(i + 10, e < 0 ? mentah.length() : e);
    lokasi.trim();
  }
  return code;
}

// Ringkas teks mentah agar muat dibaca di Serial Monitor
String ringkas(String t, size_t n){
  t.replace("\r", "");
  t.replace("\n", " | ");
  return potong(t, n);
}

// Satu kali percobaan kirim. Mengembalikan kode HTTP request pertama.
// 302 = script sudah dijalankan (redirect hanya membawa balasan teksnya).
int kirimSekali(const String& url, String& balasan){
  String lokasi, mentah;
  int code = httpGetRaw(url, lokasi, mentah);
  balasan = "Respons 1: " + ringkas(mentah, 260);

  if ((code == 301 || code == 302 || code == 303 || code == 307 || code == 308) && lokasi.indexOf("accounts.google.com") >= 0) {
    balasan += "\n[HTTP] >>> DEPLOYMENT MEMINTA LOGIN GOOGLE. Atur 'Who has access' = Anyone, lalu deploy versi baru.";
    return -20;
  }

  if ((code == 301 || code == 302 || code == 303 || code == 307 || code == 308) && lokasi.length() > 0) {
    String lokasi2, mentah2;
    int code2 = httpGetRaw(lokasi, lokasi2, mentah2);
    int b = mentah2.indexOf("\r\n\r\n");
    String isi2 = (b >= 0) ? mentah2.substring(b + 4) : mentah2;
    balasan += "\n[HTTP] Respons 2 (kode " + String(code2) + "): " + ringkas(isi2, 160);
  }
  return code;
}

bool sendToSheets(float ph, float t, float ec, float moist, float N, float P, float K){
  if (WiFi.status()!=WL_CONNECTED) return false;

  // nilai NaN dikirim kosong (bukan angka sampah)
  // String(v,0) di ESP32 memberi spasi di depan (mis. " 0") -> harus di-trim agar URL valid
  auto f = [](float v, int d){
    if (isnan(v)) return String("");
    String x = String(v, d);
    x.trim();
    return x;
  };
  String url = String(WEB_APP_URL) + "?ph=" + f(ph,2) + "&temp=" + f(t,1) + "&ec=" + f(ec,0) +
               "&moist=" + f(moist,1) + "&N=" + f(N,0) + "&P=" + f(P,0) +
               "&K=" + f(K,0) + "&dev=" + DEVICE_NAME;

  Serial.println("[Sheets] URL: " + url);
  Serial.printf("[Sheets] Panjang URL: %u, Free heap: %u\n", url.length(), ESP.getFreeHeap());

  // Coba sampai 3 kali jika gagal
  for (int percobaan = 1; percobaan <= 3; percobaan++) {
    String balasan;
    int code = kirimSekali(url, balasan);
    Serial.printf("[HTTP] Percobaan %d -> kode %d\n", percobaan, code);
    Serial.println("[HTTP] " + balasan);

    if (code == 302 || code == 200) { Serial.println("[Sheets] Terkirim"); return true; }
    if (code == -20) return false;   // masalah akses deployment, percuma diulang
    delay(2000);
  }
  Serial.println("[Sheets] Gagal setelah 3 percobaan");
  return false;
}

//OLED
void drawOLED(float ph,float t,float ec,float m,float N,float P,float K){
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  const int xL = 0;   // kolom label
  const int xC = 20;  // kolom tanda ':'
  const int xV = 30;  // kolom nilai
  int y = 0;          // baris awal
  auto row = [&](const char* label, const char* val){
    display.setCursor(xL, y); display.print(label);
    display.setCursor(xC, y); display.print(':');
    display.setCursor(xV, y); display.print(val);
    y += 9; // langkah vertikal 9px → muat 7 baris di 64px
  };

  char buf[22];
  snprintf(buf, sizeof(buf), "%.2f", ph);   row("pH",  buf);
  snprintf(buf, sizeof(buf), "%.1f C",     t);     row("T",   buf);
  snprintf(buf, sizeof(buf), "%.0f uS/cm", ec);    row("EC",  buf);
  snprintf(buf, sizeof(buf), "%.1f %%",    m);     row("M",   buf);
  snprintf(buf, sizeof(buf), "%.0f mg/kg", N);     row("N",   buf);
  snprintf(buf, sizeof(buf), "%.0f mg/kg", P);     row("P",   buf);
  snprintf(buf, sizeof(buf), "%.0f mg/kg", K);     row("K",   buf);

  // status pompa & MQTT (kolom kanan, tidak menimpa nilai sensor)
  display.setCursor(76, 0); display.print("PMP:");
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) display.print(pompaOn[i] ? '1' : '0');
  display.setCursor(76, 9); display.print(mqtt.connected() ? "MQTT OK" : "MQTT --");

  display.display();
}
void refreshOLED(){ drawOLED(dPh,dTemp,dEc,dMoist,dN,dP,dK); }

//mqtt: status pompa
void kirimStatusPompa() {
  if (!mqtt.connected()) return;

  // Ringkasan semua channel
  {
    JsonDocument doc;
    doc["pumpOn"] = adaPompaOn();            // true jika ada pompa yang menyala
    JsonArray arr = doc["pumps"].to<JsonArray>();
    for (uint8_t i = 0; i < JUMLAH_POMPA; i++) arr.add(pompaOn[i]);
    doc["updatedAt"] = millis();

    char buffer[160];
    const size_t ukuran = serializeJson(doc, buffer, sizeof(buffer));

    if (ukuran == 0 || ukuran >= sizeof(buffer)) {
      Serial.println("Gagal membuat JSON status pompa");
      return;
    }
    if (!mqtt.publish(TOPIC_STATUS, buffer, true)) {
      Serial.println("Gagal mengirim status pompa");
    }
  }

  // Status per channel
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) {
    JsonDocument doc;
    doc["channel"] = i + 1;
    doc["pumpOn"] = pompaOn[i];
    doc["updatedAt"] = millis();

    char buffer[96];
    const size_t ukuran = serializeJson(doc, buffer, sizeof(buffer));
    if (ukuran == 0 || ukuran >= sizeof(buffer)) continue;

    char topik[80];
    snprintf(topik, sizeof(topik), "%s%u", TOPIC_STATUS_CH, i + 1);
    mqtt.publish(topik, buffer, true);
  }
}

// Atur satu relay (tanpa publish)
void aturRelay(uint8_t ch, bool status) {
  if (ch >= JUMLAH_POMPA) return;

  // Jangan mengulang timer batas maksimal kalau pompa sudah menyala.
  if (status && !pompaOn[ch]) {
    waktuPompa[ch] = millis();
  }

  pompaOn[ch] = status;

  digitalWrite(
    PIN_POMPA[ch],
    RELAY_ACTIVE_LOW
      ? (status ? LOW : HIGH)
      : (status ? HIGH : LOW)
  );

  Serial.printf("Pompa %u: %s\n", ch + 1, status ? "ON" : "OFF");
}

// ch = 0..3 (channel 1..4)
void setPompa(uint8_t ch, bool status) {
  aturRelay(ch, status);
  kirimStatusPompa();
  refreshOLED();
}

void setSemuaPompa(bool status) {
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) aturRelay(i, status);
  kirimStatusPompa();
  refreshOLED();
}

void callback(char* topic, byte* payload, unsigned int length) {
  String pesan;
  pesan.reserve(length);

  for (unsigned int i = 0; i < length; i++) {
    pesan += static_cast<char>(payload[i]);
  }
  pesan.trim();
  pesan.toUpperCase();

  // Tentukan target: -1 = semua channel, 0..3 = satu channel
  int target;
  const size_t lenPrefix = strlen(TOPIC_CMD_CH);

  if (strcmp(topic, TOPIC_CMD) == 0) {
    target = -1;
  } else if (strncmp(topic, TOPIC_CMD_CH, lenPrefix) == 0 &&
             topic[lenPrefix] >= '1' && topic[lenPrefix] < '1' + JUMLAH_POMPA &&
             topic[lenPrefix + 1] == '\0') {
    target = topic[lenPrefix] - '1';
  } else {
    return;
  }

  Serial.printf("Perintah diterima [%s]: %s\n", topic, pesan.c_str());

  bool nyala;
  if (pesan == "ON") {
    nyala = true;
  } else if (pesan == "OFF") {
    nyala = false;
  } else {
    Serial.println("Perintah tidak dikenal; gunakan ON atau OFF");
    return;
  }

  if (target < 0) setSemuaPompa(nyala);
  else            setPompa((uint8_t)target, nyala);
}

//mqtt: koneksi (non-blocking, dicoba berkala agar sensor/OLED/pompa tetap jalan)
void mqttEnsure() {
  if (mqtt.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long sekarang = millis();
  if (sekarang - waktuMqttCoba < INTERVAL_MQTT_RETRY_MS) return;
  waktuMqttCoba = sekarang;

  Serial.println("Menghubungkan MQTT...");

  if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
    Serial.println("MQTT terhubung");

    if (mqtt.subscribe(TOPIC_CMD, 1)) {
      Serial.printf("Subscribe berhasil: %s\n", TOPIC_CMD);
    } else {
      Serial.println("Subscribe topic command gagal");
    }
    if (mqtt.subscribe(TOPIC_CMD_SUB, 1)) {
      Serial.printf("Subscribe berhasil: %s\n", TOPIC_CMD_SUB);
    } else {
      Serial.println("Subscribe topic command per channel gagal");
    }

    kirimStatusPompa();
    waktuStatus = millis();
    refreshOLED();
  } else {
    Serial.printf("MQTT gagal, kode: %d\n", mqtt.state());
  }
}

//mqtt: telemetry (sekarang memakai data sensor asli)
void kirimDataSensor() {
  JsonDocument doc;

  doc["deviceId"]    = "esp32-01";
  doc["temperature"] = dTemp;
  doc["moisture"]    = dMoist;
  doc["ph"]          = dPh;
  doc["ec"]          = dEc;
  doc["nitrogen"]    = dN;
  doc["phosphorus"]  = dP;
  doc["potassium"]   = dK;

  // Sensor tidak punya output TDS; ini hanya estimasi kasar dari EC (EC x 0.5).
  doc["tds"] = isnan(dEc) ? NAN : dEc * 0.5f;

  char buffer[320];
  const size_t ukuran = serializeJson(doc, buffer, sizeof(buffer));

  if (ukuran == 0 || ukuran >= sizeof(buffer)) {
    Serial.println("Gagal membuat JSON telemetry");
    return;
  }

  if (mqtt.publish(TOPIC_DATA, buffer)) {
    Serial.print("Telemetry terkirim: ");
    Serial.println(buffer);
  } else {
    Serial.println("Gagal mengirim telemetry");
  }
}

//laporan status ke Serial Monitor
void laporStatus(){
  Serial.println("------ STATUS ------");
  if (WiFi.status()==WL_CONNECTED)
    Serial.printf("WiFi  : TERHUBUNG (%s, %d dBm, %s)\n", WiFi.SSID().c_str(), WiFi.RSSI(), WiFi.localIP().toString().c_str());
  else
    Serial.println("WiFi  : TERPUTUS");

  Serial.printf("MQTT  : %s\n", mqtt.connected() ? "TERHUBUNG" : "TERPUTUS");

  bool sensorOk = !(isnan(dPh) && isnan(dTemp) && isnan(dEc) && isnan(dMoist) && isnan(dN));
  Serial.printf("Sensor: %s\n", sensorOk ? "OK" : "GAGAL BACA (cek RS485/power sensor)");

  Serial.print("Pompa : ");
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) Serial.printf("%u=%s ", i + 1, pompaOn[i] ? "ON" : "OFF");
  Serial.println();
  Serial.println("--------------------");
}

//setting
void setup(){
  Serial.begin(115200);

  // Atur relay ke posisi OFF saat startup.
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) {
    digitalWrite(PIN_POMPA[i], RELAY_ACTIVE_LOW ? HIGH : LOW);
    pinMode(PIN_POMPA[i], OUTPUT);
    pompaOn[i] = false;
  }

  pinMode(PIN_LED_WIFI, OUTPUT);
  digitalWrite(PIN_LED_WIFI, LOW);   // mati sampai WiFi terhubung

  WiFi.onEvent(onWiFiEvent); wifiStartOnce();

  if (USE_REDE){ pinMode(REDE_PIN, OUTPUT); digitalWrite(REDE_PIN, LOW); }

  RS.begin(BAUD, UART_CFG, RX2_PIN, TX2_PIN);

  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  display.clearDisplay(); display.display();

  // Hanya untuk pengujian sementara:
  // koneksi TLS terenkripsi, tetapi sertifikat server tidak diverifikasi.
  // Untuk pemakaian sebenarnya, ganti dengan espClient.setCACert(root_ca).
  espClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(callback);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);

  // supaya siklus pertama langsung jalan begitu siap
  unsigned long now = millis();
  waktuSensor = now - INTERVAL_SENSOR_MS;
  waktuData   = now - INTERVAL_TELEMETRI_MS;
  waktuSheets = now - INTERVAL_SHEETS_MS;
  waktuStatus = now;
  waktuMqttCoba = now - INTERVAL_MQTT_RETRY_MS;
  waktuLaporan = now;
}

//loop utama (tanpa delay panjang agar MQTT & timer pompa tetap berjalan)
void loop(){
  wifiEnsure();

  // LED D2 (GPIO2): menyala jika WiFi terhubung
  digitalWrite(PIN_LED_WIFI, WiFi.status()==WL_CONNECTED ? HIGH : LOW);

  mqttEnsure();
  if (mqtt.connected()) mqtt.loop();

  // Info jika status MQTT berubah
  bool mqttSekarang = mqtt.connected();
  if (mqttSebelumnya && !mqttSekarang) {
    Serial.printf("[MQTT] Terputus (state %d)\n", mqtt.state());
    refreshOLED();
  }
  mqttSebelumnya = mqttSekarang;

  // Batas waktu tiap pompa
  bool adaTimeout = false;
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) {
    if (pompaOn[i] && millis() - waktuPompa[i] >= MAX_RUN_MS) {
      Serial.printf("Batas waktu tercapai, pompa %u dimatikan\n", i + 1);
      aturRelay(i, false);
      adaTimeout = true;
    }
  }
  if (adaTimeout) {
    kirimStatusPompa();
    refreshOLED();
  }

  const unsigned long sekarang = millis();

  // Laporan status berkala
  if (sekarang - waktuLaporan >= INTERVAL_LAPORAN_MS) {
    waktuLaporan = sekarang;
    laporStatus();
  }

  // Baca sensor + update OLED
  if (sekarang - waktuSensor >= INTERVAL_SENSOR_MS) {
    waktuSensor = sekarang;
    bacaSensor();
    refreshOLED();
  }

  // Status pompa via MQTT
  if (mqtt.connected() && sekarang - waktuStatus >= INTERVAL_STATUS_MS) {
    waktuStatus = sekarang;
    kirimStatusPompa();
  }

  // Telemetry via MQTT
  if (mqtt.connected() && sekarang - waktuData >= INTERVAL_TELEMETRI_MS) {
    waktuData = sekarang;
    kirimDataSensor();
  }

  // Kirim ke Google Sheets
  if (sekarang - waktuSheets >= INTERVAL_SHEETS_MS) {
    if (WiFi.status()==WL_CONNECTED) {
      waktuSheets = sekarang;
      if (isnan(dPh) && isnan(dTemp) && isnan(dEc) && isnan(dMoist) &&
          isnan(dN) && isnan(dP) && isnan(dK)) {
        Serial.println("[Sheets] Semua sensor gagal dibaca, skip send.");
      } else {
        sendToSheets(dPh,dTemp,dEc,dMoist,dN,dP,dK);
      }
    } else {
      Serial.println("[WiFi] Not connected, skip send.");
      waktuSheets = sekarang;
    }
  }
}
