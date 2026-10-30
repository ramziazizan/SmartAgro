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
#include <Preferences.h>

#include "agro_logic.h"    // logika murni (C): Modbus, perintah MQTT, URL/HTTP, validasi, dll
#include "wifi_setup.h"    // WiFi: simpan SSID/password di flash + portal setup

//wifi: TIDAK ADA lagi SSID/password di kode.
//Isi lewat portal web (AP "SmartAgro-Setup") atau perintah Serial Monitor (ketik HELP).

//google sheets
const char* WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyYUEmxWRfI9LbsvJlKpMx7hnBFitIKx1B3PxS_6h6LIGts9wisPQrwnIlWBo1KSWDK8A/exec";
const char* DEVICE_NAME = "ESP32-Soil-01";

//mqtt
const char* MQTT_HOST = "lef16918.ala.asia-southeast1.emqxsl.com";
const int   MQTT_PORT = 8883;

const char* MQTT_USER = "FunDev2026";
const char* MQTT_PASS = "Ayam_Gepuk_Asli_Malaysia";
const char* MQTT_CLIENT_ID = "smart-agro-backend";

const char* TOPIC_DATA   = "smartagro/esp32-01/telemetry";
const char* TOPIC_CMD       = "smartagro/esp32-01/command/pump";     // ON/OFF -> SEMUA channel
const char* TOPIC_CMD_CH    = "smartagro/esp32-01/command/pump/";    // + nomor 1-4 -> satu channel
const char* TOPIC_CMD_SUB   = "smartagro/esp32-01/command/pump/+";  // untuk subscribe
const char* TOPIC_STATUS    = "smartagro/esp32-01/status/pump";      // ringkasan semua channel
const char* TOPIC_STATUS_CH = "smartagro/esp32-01/status/pump/";     // + nomor 1-4

//pompa / relay 4 channel (IN1..IN4)
const uint8_t JUMLAH_POMPA = 4;
const int  PIN_POMPA[JUMLAH_POMPA] = {15, 26, 32, 33};   // ubah di sini jika wiring berbeda
//Mode relay (disimpan di flash, bisa diganti lewat Serial Monitor tanpa upload ulang):
//  0 = modul aktif-LOW biasa   (ON = pin LOW,  OFF = pin HIGH)
//  1 = aktif-LOW "open-drain"  (ON = pin LOW,  OFF = pin dilepas)  <- untuk modul 5V yang tidak mati oleh HIGH 3.3V
//  2 = modul aktif-HIGH        (ON = pin HIGH, OFF = pin LOW)
//Relay tidak sesuai? Ketik RELAY=0 / RELAY=1 / RELAY=2 di Serial Monitor, lalu TESRELAY untuk menguji.
const uint8_t RELAY_MODE_DEFAULT = 1;
uint8_t relayMode = RELAY_MODE_DEFAULT;

//LED indikator WiFi (D2 = GPIO2, LED bawaan board)
//menyala = WiFi terhubung, berkedip cepat = portal setup aktif
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
bool portalSebelumnya = false;
unsigned long waktuPompa[JUMLAH_POMPA] = {0, 0, 0, 0};
bool pompaOn[JUMLAH_POMPA] = {false, false, false, false};

bool adaPompaOn(){
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) if (pompaOn[i]) return true;
  return false;
}

//RS485 TX (perangkat keras)
static inline void rs485_tx(const uint8_t* d, size_t n){
  if (USE_REDE) digitalWrite(REDE_PIN, HIGH);
  RS.write(d, n);
  RS.flush();
  delayMicroseconds(600);
  if (USE_REDE) digitalWrite(REDE_PIN, LOW);
}

// Kirim permintaan, kumpulkan balasan; pembuatan frame + validasi ada di agro_logic.c
bool readHolding(uint16_t start, uint16_t count, uint16_t* out){
  uint8_t q[8];
  agro_modbus_buat_baca(SID, start, count, q);
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
  return agro_modbus_urai_balasan(r, n, SID, count, out);
}

//baca semua sensor tanah ke variabel global
void bacaSensor(){
  uint16_t v[3];
  dPh = dTemp = dEc = dMoist = NAN;
  dN = dP = dK = NAN;

  if(readHolding(REG_PH,1,v))   dPh    = agro_skala_ph(v[0]);
  if(readHolding(REG_TEMP,1,v)) dTemp  = agro_skala_suhu(v[0]);
  if(readHolding(REG_EC,1,v))   dEc    = v[0];
  if(readHolding(REG_MOIS,1,v)) dMoist = agro_skala_lembab(v[0]);
  if(readHolding(REG_NPK,3,v))  { dN=v[0]; dP=v[1]; dK=v[2]; }
}

bool semuaSensorGagal(){
  const float semua[7] = {dPh, dTemp, dEc, dMoist, dN, dP, dK};
  return agro_semua_nan(semua, 7);
}

//googlesheet
// Potong teks panjang agar Serial Monitor tetap terbaca
String potong(const String& t, size_t n){
  return t.length() > n ? t.substring(0, n) + "..." : t;
}

// Ringkas teks mentah agar muat dibaca di Serial Monitor
String ringkas(String t, size_t n){
  t.replace("\r", "");
  t.replace("\n", " | ");
  return potong(t, n);
}

// HTTP GET mentah lewat TLS (tanpa HTTPClient).
// Parsing URL/status/header memakai fungsi C di agro_logic.c.
// Mengembalikan kode status HTTP; "mentah" berisi awal respons apa adanya (untuk debug).
int httpGetRaw(const char* url, char* lokasi, size_t lokasiLen, String& mentah){
  static char host[96];
  static char path[640];
  lokasi[0] = '\0'; mentah = "";

  int r = agro_url_pisah(url, host, sizeof(host), path, sizeof(path));
  if (r < 0) return r;

  WiFiClientSecure c;
  c.setInsecure();
  if (!c.connect(host, 443)) return -1;

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

  int code = agro_http_status(mentah.c_str());
  if (code < 0) return -2;

  agro_http_header(mentah.c_str(), "Location", lokasi, lokasiLen);
  return code;
}

// Satu kali percobaan kirim. Mengembalikan kode HTTP request pertama.
// 302 = script sudah dijalankan (redirect hanya membawa balasan teksnya).
int kirimSekali(const char* url, String& balasan){
  static char lokasi1[640];
  static char lokasi2[640];
  String mentah;

  int code = httpGetRaw(url, lokasi1, sizeof(lokasi1), mentah);
  balasan = "Respons 1: " + ringkas(mentah, 260);

  if (agro_http_redirect(code) && strstr(lokasi1, "accounts.google.com") != nullptr) {
    balasan += "\n[HTTP] >>> DEPLOYMENT MEMINTA LOGIN GOOGLE. Atur 'Who has access' = Anyone, lalu deploy versi baru.";
    return -20;
  }

  if (agro_http_redirect(code) && lokasi1[0] != '\0') {
    String mentah2;
    int code2 = httpGetRaw(lokasi1, lokasi2, sizeof(lokasi2), mentah2);
    String isi2 = agro_http_body(mentah2.c_str());
    balasan += "\n[HTTP] Respons 2 (kode " + String(code2) + "): " + ringkas(isi2, 160);
  }
  return code;
}

bool sendToSheets(float ph, float t, float ec, float moist, float N, float P, float K){
  if (WiFi.status()!=WL_CONNECTED) return false;

  // URL dibangun di C: nilai NaN dikirim kosong, nama perangkat di-encode
  static char url[512];
  if (agro_buat_url_sheets(url, sizeof(url), WEB_APP_URL, ph, t, ec, moist, N, P, K, DEVICE_NAME) < 0) {
    Serial.println("[Sheets] URL terlalu panjang, batal kirim.");
    return false;
  }

  Serial.printf("[Sheets] URL: %s\n", url);
  Serial.printf("[Sheets] Panjang URL: %u, Free heap: %u\n", (unsigned)strlen(url), ESP.getFreeHeap());

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
  agro_fmt_nilai(buf, sizeof(buf), ph, 2, "");          row("pH", buf);
  agro_fmt_nilai(buf, sizeof(buf), t,  1, " C");        row("T",  buf);
  agro_fmt_nilai(buf, sizeof(buf), ec, 0, " uS/cm");    row("EC", buf);
  agro_fmt_nilai(buf, sizeof(buf), m,  1, " %");        row("M",  buf);
  agro_fmt_nilai(buf, sizeof(buf), N,  0, " mg/kg");    row("N",  buf);
  agro_fmt_nilai(buf, sizeof(buf), P,  0, " mg/kg");    row("P",  buf);
  agro_fmt_nilai(buf, sizeof(buf), K,  0, " mg/kg");    row("K",  buf);

  // status pompa, MQTT & WiFi (kolom kanan, tidak menimpa nilai sensor)
  display.setCursor(76, 0); display.print("PMP:");
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) display.print(pompaOn[i] ? '1' : '0');
  display.setCursor(76, 9);  display.print(mqtt.connected() ? "MQTT OK" : "MQTT --");
  display.setCursor(76, 18); display.print(WiFi.status()==WL_CONNECTED ? "WIFI OK" : "WIFI --");

  display.display();
}

// Layar petunjuk saat portal setup WiFi aktif
void drawPortalOLED(){
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);  display.print("== SETUP WIFI ==");
  display.setCursor(0, 12); display.print("1.Sambung WiFi:");
  display.setCursor(0, 21); display.print(PORTAL_AP_SSID);
  display.setCursor(0, 30); display.print("Pass:"); display.print(PORTAL_AP_PASS);
  display.setCursor(0, 42); display.print("2.Buka browser:");
  display.setCursor(0, 51); display.print("192.168.4.1");
  display.display();
}

void refreshOLED(){
  if (wifiPortalAktif()) drawPortalOLED();
  else                   drawOLED(dPh,dTemp,dEc,dMoist,dN,dP,dK);
}

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

// Menulis kondisi ke pin relay sesuai mode relay (logika di agro_relay_aksi, agro_logic.c)
void tulisRelay(uint8_t ch, bool nyala) {
  const agro_pin_aksi_t aksi = agro_relay_aksi(nyala, relayMode);

  if (aksi == AGRO_PIN_LEPAS) {
    pinMode(PIN_POMPA[ch], INPUT);               // dilepas -> modul menarik ke 5V sendiri
  } else {
    pinMode(PIN_POMPA[ch], OUTPUT);
    digitalWrite(PIN_POMPA[ch], aksi == AGRO_PIN_HIGH ? HIGH : LOW);
  }
}

void muatModeRelay() {
  Preferences pref;
  pref.begin("relay", false);
  relayMode = pref.getUChar("mode", RELAY_MODE_DEFAULT);
  pref.end();
  if (relayMode > AGRO_RELAY_MODE_MAKS) relayMode = RELAY_MODE_DEFAULT;
}

void simpanModeRelay(uint8_t mode) {
  Preferences pref;
  pref.begin("relay", false);
  pref.putUChar("mode", mode);
  pref.end();
  relayMode = mode;
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) tulisRelay(i, pompaOn[i]);   // terapkan ke pin
}

// Uji relay 1-4 satu per satu. LEPAS BEBAN (pompa) dulu supaya tidak menyala sungguhan.
void tesRelay() {
  Serial.printf("[Tes] Mode relay %u. Relay 1-4 menyala bergantian (1,5 detik). Lepas pompa dulu!\n", relayMode);
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) {
    Serial.printf("[Tes] Relay %u ON\n", i + 1);
    tulisRelay(i, true);
    delay(1500);
    tulisRelay(i, pompaOn[i]);
    delay(500);
  }
  Serial.println("[Tes] Selesai. Jika relay ON saat seharusnya OFF (atau sebaliknya), coba RELAY=0, RELAY=1, atau RELAY=2.");
}

// Atur satu relay (tanpa publish)
void aturRelay(uint8_t ch, bool status) {
  if (ch >= JUMLAH_POMPA) return;

  // Jangan mengulang timer batas maksimal kalau pompa sudah menyala.
  if (status && !pompaOn[ch]) {
    waktuPompa[ch] = millis();
  }

  pompaOn[ch] = status;
  tulisRelay(ch, status);

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

// Penentuan topik/isi perintah ada di agro_parse_perintah() (agro_logic.c)
void callback(char* topic, byte* payload, unsigned int length) {
  int target = -1;
  bool nyala = false;

  agro_cmd_hasil_t hasil = agro_parse_perintah(topic, TOPIC_CMD, TOPIC_CMD_CH, JUMLAH_POMPA,
                                               payload, length, &target, &nyala);
  if (hasil == AGRO_CMD_ABAIKAN) return;

  Serial.printf("Perintah diterima [%s]\n", topic);

  if (hasil == AGRO_CMD_TIDAK_DIKENAL) {
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

//mqtt: telemetry (memakai data sensor asli)
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
  doc["tds"] = agro_tds_dari_ec(dEc);

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
  else if (!wifiAdaKredensial())
    Serial.println("WiFi  : BELUM DIATUR (isi lewat portal atau Serial: ketik HELP)");
  else
    Serial.printf("WiFi  : TERPUTUS (tersimpan: \"%s\")\n", wifiSsidTersimpan());

  if (wifiPortalAktif())
    Serial.printf("Portal: AKTIF (AP %s, http://192.168.4.1)\n", PORTAL_AP_SSID);

  Serial.printf("MQTT  : %s\n", mqtt.connected() ? "TERHUBUNG" : "TERPUTUS");
  Serial.printf("Sensor: %s\n", semuaSensorGagal() ? "GAGAL BACA (cek RS485/power sensor)" : "OK");

  Serial.printf("Relay : mode %u\n", relayMode);
  Serial.print("Pompa : ");
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) Serial.printf("%u=%s ", i + 1, pompaOn[i] ? "ON" : "OFF");
  Serial.println();
  Serial.println("--------------------");
}

//perintah lewat Serial Monitor (set WiFi tanpa edit kode)
void cetakBantuan(){
  Serial.println("=== PERINTAH SERIAL (set Line ending: Newline / Both NL & CR) ===");
  Serial.println("SSID=<nama wifi>   : atur nama WiFi (boleh ada spasi)");
  Serial.println("PASS=<password>    : atur password lalu langsung menyambung");
  Serial.println("                     (PASS= kosong untuk WiFi tanpa password)");
  Serial.println("PORTAL             : buka portal setup lewat browser");
  Serial.println("WIFIRESET          : hapus WiFi tersimpan & buka portal");
  Serial.println("STATUS             : tampilkan status sekarang");
  Serial.println("RELAY=0|1|2        : mode relay (0 aktif-LOW, 1 aktif-LOW open-drain, 2 aktif-HIGH)");
  Serial.println("TESRELAY           : uji relay 1-4 bergantian (lepas pompa dulu)");
  Serial.println("HELP               : tampilkan bantuan ini");
  Serial.println("Contoh: SSID=RumahKu  lalu  PASS=rahasia123");
}

char ssidSementara[33] = "";

void prosesPerintahSerial(char* baris){
  const char* nilai = "";
  switch (agro_parse_serial(baris, &nilai)) {
    case AGRO_SER_KOSONG:
      break;

    case AGRO_SER_SSID:
      if (!agro_ssid_valid(nilai)) {
        Serial.println("[Serial] SSID harus 1-32 karakter.");
      } else {
        strlcpy(ssidSementara, nilai, sizeof(ssidSementara));
        Serial.printf("[Serial] SSID diset: \"%s\". Sekarang kirim PASS=<password>\n", ssidSementara);
      }
      break;

    case AGRO_SER_PASS: {
      const char* ssid = ssidSementara[0] ? ssidSementara : wifiSsidTersimpan();
      if (ssid[0] == '\0') {
        Serial.println("[Serial] Kirim SSID=<nama wifi> dulu.");
      } else if (!agro_pass_valid(nilai)) {
        Serial.println("[Serial] Password harus 8-63 karakter (atau kosong untuk WiFi terbuka).");
      } else if (wifiSimpanKredensial(ssid, nilai)) {
        ssidSementara[0] = '\0';
        Serial.println("[Serial] Tersimpan. Menyambung...");
      }
      break;
    }

    case AGRO_SER_HAPUS:
      wifiHapusKredensial();
      wifiBukaPortal();
      break;

    case AGRO_SER_PORTAL:
      wifiBukaPortal();
      break;

    case AGRO_SER_STATUS:
      laporStatus();
      break;

    case AGRO_SER_RELAY:
      if (nilai[0] >= '0' && nilai[0] <= '0' + AGRO_RELAY_MODE_MAKS && nilai[1] == '\0') {
        simpanModeRelay((uint8_t)(nilai[0] - '0'));
        Serial.printf("[Relay] Mode relay = %u (tersimpan di flash). Ketik TESRELAY untuk menguji.\n", relayMode);
      } else {
        Serial.println("[Relay] Isi RELAY=0, RELAY=1, atau RELAY=2.");
      }
      break;

    case AGRO_SER_TES_RELAY:
      tesRelay();
      break;

    case AGRO_SER_BANTUAN:
      cetakBantuan();
      break;

    default:
      Serial.println("[Serial] Perintah tidak dikenal. Ketik HELP.");
      break;
  }
}

void cekSerial(){
  static char buf[128];
  static size_t len = 0;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      buf[len] = '\0';
      if (len > 0) prosesPerintahSerial(buf);
      len = 0;
    } else if (len < sizeof(buf) - 1) {
      buf[len++] = ch;
    }
  }
}

//setting
void setup(){
  Serial.begin(115200);

  // Atur relay ke posisi OFF saat startup (mode relay dibaca dari flash).
  muatModeRelay();
  for (uint8_t i = 0; i < JUMLAH_POMPA; i++) {
    tulisRelay(i, false);
    pompaOn[i] = false;
  }

  pinMode(PIN_LED_WIFI, OUTPUT);
  digitalWrite(PIN_LED_WIFI, LOW);   // mati sampai WiFi terhubung

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

  // WiFi: muat SSID/password dari flash; jika kosong, portal setup langsung dibuka
  wifiSetupBegin();
  portalSebelumnya = wifiPortalAktif();
  refreshOLED();

  Serial.println("Ketik HELP untuk daftar perintah (atur WiFi lewat Serial).");

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
  wifiLoop();      // koneksi WiFi + portal setup + tombol BOOT
  cekSerial();     // perintah SSID=/PASS=/PORTAL/... dari Serial Monitor

  // LED D2 (GPIO2): menyala jika WiFi terhubung, berkedip jika portal aktif
  if (wifiPortalAktif()) digitalWrite(PIN_LED_WIFI, ((millis() / 250) & 1) ? HIGH : LOW);
  else                   digitalWrite(PIN_LED_WIFI, WiFi.status()==WL_CONNECTED ? HIGH : LOW);

  // Ganti layar OLED saat portal dibuka/ditutup
  bool portalSekarang = wifiPortalAktif();
  if (portalSekarang != portalSebelumnya) {
    portalSebelumnya = portalSekarang;
    refreshOLED();
  }

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
    if (agro_pompa_timeout(pompaOn[i], waktuPompa[i], millis(), MAX_RUN_MS)) {
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
      if (semuaSensorGagal()) {
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
