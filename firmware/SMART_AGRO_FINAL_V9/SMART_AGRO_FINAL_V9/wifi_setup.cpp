#include "wifi_setup.h"
#include "agro_logic.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// ======================= state =======================
static Preferences prefs;
static WebServer   server(80);
static DNSServer   dns;

static char g_ssid[33] = "";
static char g_pass[65] = "";

// koneksi STA (non-blocking, auto reconnect)
static bool     wifiConnecting   = false;
static uint32_t lastAttemptMs    = 0;
static uint32_t lastDisconnectMs = 0;
static const uint32_t CONNECT_TIMEOUT_MS = 20000;

// portal
static bool     portalAktif          = false;
static bool     handlerTerdaftar     = false;
static bool     tutupSetelahTersambung = false;
static uint32_t portalMulaiMs        = 0;
static uint32_t tersambungDiPortalMs = 0;
static uint32_t terakhirTersambungMs = 0;
static String   opsiJaringan;          // hasil scan (HTML <option>)

// ======================= event WiFi =======================
static void onWiFiEvent(WiFiEvent_t e, WiFiEventInfo_t info) {
  if (e == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.print("[WiFi] IP: "); Serial.println(WiFi.localIP());
    wifiConnecting = false;
  } else if (e == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    Serial.printf("[WiFi] Disconnected, reason: %d\n", info.wifi_sta_disconnected.reason);
    wifiConnecting = false;
    lastDisconnectMs = millis();
  }
}

// ======================= koneksi STA =======================
static void wifiStartOnce() {
  if (wifiConnecting || g_ssid[0] == '\0') return;
  wifiConnecting = true;
  lastAttemptMs = millis();
  WiFi.persistent(false);
  WiFi.mode(portalAktif ? WIFI_AP_STA : WIFI_STA);
  WiFi.setSleep(false);
  Serial.printf("[WiFi] Connecting ke \"%s\"...\n", g_ssid);
  WiFi.begin(g_ssid, g_pass);
}

static void wifiEnsure() {
  if (g_ssid[0] == '\0') return;
  if (WiFi.status() == WL_CONNECTED) return;

  if (!wifiConnecting) {
    if (millis() - lastDisconnectMs < 5000) return;   // jeda 5 detik sebelum coba lagi
    wifiStartOnce();
    return;
  }
  if (millis() - lastAttemptMs > CONNECT_TIMEOUT_MS) {
    Serial.println("[WiFi] Timeout, reset STA");
    wifiConnecting = false;
    WiFi.disconnect(false, true);
    delay(200);
    wifiStartOnce();
  }
}

// ======================= kredensial (NVS) =======================
bool wifiAdaKredensial() { return g_ssid[0] != '\0'; }
const char* wifiSsidTersimpan() { return g_ssid; }

bool wifiSimpanKredensial(const char* ssid, const char* pass) {
  if (!agro_ssid_valid(ssid) || !agro_pass_valid(pass)) return false;

  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  strlcpy(g_ssid, ssid, sizeof(g_ssid));
  strlcpy(g_pass, pass, sizeof(g_pass));

  Serial.printf("[WiFi] Kredensial disimpan: \"%s\"\n", g_ssid);

  // sambung ulang dengan kredensial baru
  WiFi.disconnect(false, true);
  wifiConnecting = false;
  lastDisconnectMs = millis() - 5000UL;
  terakhirTersambungMs = millis();
  return true;
}

void wifiHapusKredensial() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
  g_ssid[0] = '\0';
  g_pass[0] = '\0';
  WiFi.disconnect(false, true);
  wifiConnecting = false;
  Serial.println("[WiFi] Kredensial dihapus.");
}

// ======================= portal: halaman web =======================
static String htmlEsc(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    switch (c) {
      case '&':  o += "&amp;";  break;
      case '<':  o += "&lt;";   break;
      case '>':  o += "&gt;";   break;
      case '"':  o += "&quot;"; break;
      case '\'': o += "&#39;";  break;
      default:   o += c;
    }
  }
  return o;
}

static void scanJaringan() {
  opsiJaringan = "";
  Serial.println("[Portal] Memindai jaringan WiFi...");
  int n = WiFi.scanNetworks();
  if (n <= 0) { WiFi.scanDelete(); return; }
  if (n > 20) n = 20;
  for (int i = 0; i < n; i++) {
    String nama = WiFi.SSID(i);
    if (nama.length() == 0) continue;
    opsiJaringan += "<button type='button' class='n' data-s=\"" + htmlEsc(nama) +
                    "\" onclick='document.getElementById(\"ssid\").value=this.dataset.s'><span>" +
                    htmlEsc(nama) + "</span><span>" + String(WiFi.RSSI(i)) + " dBm</span></button>";
  }
  WiFi.scanDelete();
}

static void kirimHalaman(const String& pesan, bool sukses) {
  const bool tersambung = (WiFi.status() == WL_CONNECTED);

  String h;
  h.reserve(6000);
  h += F("<!DOCTYPE html><html lang='id'><head><meta charset='utf-8'>"
         "<meta name='viewport' content='width=device-width,initial-scale=1'>"
         "<title>Setup WiFi - Smart Agro</title><style>"
         ":root{color-scheme:dark}*{box-sizing:border-box}"
         "body{margin:0;padding:20px 14px;background:#080c1f;color:#e8ecff;"
         "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}"
         ".w{max-width:460px;margin:auto}"
         ".hd{display:flex;align-items:center;gap:12px}"
         ".lg{width:42px;height:42px;border-radius:11px;background:#161d3d;color:#a78bfa;"
         "display:flex;align-items:center;justify-content:center}"
         "h1{font-size:22px;margin:0}"
         ".sub{color:#9aa4c7;font-size:13px;margin:8px 0 18px}"
         ".c{background:linear-gradient(160deg,#0f1634,#0b1029);border:1px solid #1d2650;"
         "border-radius:16px;padding:16px;margin-bottom:14px}"
         ".tag{display:inline-block;background:#1a1b4b;border:1px solid #3b3a8f;color:#c4b5fd;"
         "font-size:11px;font-weight:600;letter-spacing:.4px;padding:5px 10px;border-radius:8px}"
         ".st{display:flex;justify-content:space-between;align-items:center;gap:10px}"
         ".pill{font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid;white-space:nowrap}"
         ".on{color:#4ade80;border-color:#14532d;background:#0c2a1c}"
         ".off{color:#fb7185;border-color:#7f1d3a;background:#2a0f1d}"
         ".mu{color:#9aa4c7;font-size:12px}"
         "label{display:block;font-size:12px;color:#9aa4c7;margin:14px 0 6px}"
         "input[type=text],input[type=password]{width:100%;padding:12px;font-size:16px;color:#fff;"
         "background:#0a0f26;border:1px solid #232d5c;border-radius:10px;outline:0}"
         "input[type=text]:focus,input[type=password]:focus{border-color:#7c3aed}"
         "button.b{margin-top:18px;width:100%;padding:13px;font-size:15px;font-weight:600;color:#fff;"
         "background:#7c3aed;border:0;border-radius:10px}"
         "button.b:active{background:#6d28d9}"
         "button.n{display:flex;justify-content:space-between;gap:10px;width:100%;padding:10px 12px;"
         "margin-top:6px;font-size:14px;color:#e8ecff;background:#0a0f26;border:1px solid #232d5c;"
         "border-radius:10px;text-align:left}"
         "button.n span:last-child{color:#9aa4c7;font-size:12px;white-space:nowrap}"
         ".p{padding:12px;border-radius:10px;margin-bottom:14px;font-size:14px;line-height:1.4}"
         ".ok{background:#0c2a1c;border:1px solid #14532d;color:#86efac}"
         ".er{background:#2a0f1d;border:1px solid #7f1d3a;color:#fda4af}"
         "a{color:#a78bfa}"
         "</style></head><body><div class='w'>"
         "<div class='hd'><div class='lg'>"
         "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' "
         "stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>"
         "<path d='M7 20h10'/><path d='M12 20v-9'/><path d='M12 11c0-4 3-6 7-6 0 4-3 6-7 6z'/>"
         "<path d='M12 13c0-3-2-5-6-5 0 3 2 5 6 5z'/></svg></div>"
         "<h1>Smart Agro</h1></div>"
         "<p class='sub'>Pengaturan WiFi perangkat ESP32</p>");

  if (pesan.length()) {
    h += String("<div class='p ") + (sukses ? "ok" : "er") + "'>" + htmlEsc(pesan) + "</div>";
  }

  // kartu status
  h += "<div class='c'><div class='st'><span class='tag'>SETUP WIFI</span><span class='pill ";
  h += tersambung ? "on'>&#9679; ESP32 Online" : "off'>&#9679; ESP32 Offline";
  h += "</span></div><p class='mu' style='margin:12px 0 0'>WiFi tersimpan: <b>";
  h += wifiAdaKredensial() ? htmlEsc(String(g_ssid)) : String("(belum ada)");
  h += "</b></p></div>";

  // kartu form
  h += F("<div class='c'><form method='POST' action='/simpan'>"
         "<label style='margin-top:0'>Nama WiFi (SSID)</label>"
         "<input type='text' id='ssid' name='ssid' maxlength='32' autocomplete='off' required>");

  if (opsiJaringan.length()) {
    h += F("<label>Jaringan terdeteksi (ketuk untuk memilih)</label>");
    h += opsiJaringan;
  }

  h += F("<label>Password</label>"
         "<input type='password' id='pw' name='pass' maxlength='63' autocomplete='off'>"
         "<label style='display:flex;gap:8px;align-items:center'>"
         "<input type='checkbox' onclick='document.getElementById(\"pw\").type=this.checked?\"text\":\"password\"'>"
         "Tampilkan password</label>"
         "<button class='b' type='submit'>Simpan &amp; Sambungkan</button></form></div>"
         "<div class='c mu'>Kosongkan password jika WiFi tanpa password. "
         "<a href='/?scan=1'>Pindai ulang jaringan</a></div>"
         "</div></body></html>");

  server.send(200, "text/html; charset=utf-8", h);
}

static void handleRoot() {
  if (server.hasArg("scan")) scanJaringan();
  kirimHalaman("", true);
}

static void handleSimpan() {
  String s = server.arg("ssid");
  String p = server.arg("pass");

  if (!agro_ssid_valid(s.c_str())) {
    kirimHalaman("Nama WiFi harus 1-32 karakter.", false);
    return;
  }
  if (!agro_pass_valid(p.c_str())) {
    kirimHalaman("Password harus 8-63 karakter (atau kosong untuk WiFi terbuka).", false);
    return;
  }

  // Kirim halaman konfirmasi DULU, baru sambung ulang
  // (saat tersambung, channel AP bisa berpindah dan HP sempat terputus).
  kirimHalaman("Tersimpan. Perangkat sedang menyambung ke \"" + s +
               "\". Jika berhasil, jaringan " PORTAL_AP_SSID " akan hilang dengan sendirinya.", true);
  delay(300);

  if (wifiSimpanKredensial(s.c_str(), p.c_str())) {
    tutupSetelahTersambung = true;
    tersambungDiPortalMs = 0;
  }
}

static void handleNotFound() {
  // Captive portal: arahkan semua alamat lain ke halaman setup
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

// ======================= portal: buka / tutup =======================
void wifiBukaPortal() {
  if (portalAktif) return;
  Serial.println("[Portal] Membuka portal setup WiFi...");

  // hentikan percobaan sambung supaya pemindaian berhasil
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect(false, true);
    wifiConnecting = false;
    lastDisconnectMs = millis();
  }

  WiFi.mode(WIFI_AP_STA);
  scanJaringan();

  WiFi.softAP(PORTAL_AP_SSID, PORTAL_AP_PASS);
  delay(100);
  dns.start(53, "*", WiFi.softAPIP());

  if (!handlerTerdaftar) {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/simpan", HTTP_POST, handleSimpan);
    server.onNotFound(handleNotFound);
    handlerTerdaftar = true;
  }
  server.begin();

  portalAktif = true;
  portalMulaiMs = millis();
  tutupSetelahTersambung = false;

  Serial.printf("[Portal] AP: %s | Password: %s | Buka http://%s\n",
                PORTAL_AP_SSID, PORTAL_AP_PASS, WiFi.softAPIP().toString().c_str());
}

void wifiTutupPortal() {
  if (!portalAktif) return;
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalAktif = false;
  terakhirTersambungMs = millis();
  Serial.println("[Portal] Portal ditutup.");
}

bool wifiPortalAktif() { return portalAktif; }

// ======================= init & loop =======================
void wifiSetupBegin() {
  pinMode(PIN_TOMBOL_SETUP, INPUT_PULLUP);
  WiFi.onEvent(onWiFiEvent);

  prefs.begin("wifi", false);
  String s = prefs.getString("ssid", "");
  String p = prefs.getString("pass", "");
  prefs.end();
  strlcpy(g_ssid, s.c_str(), sizeof(g_ssid));
  strlcpy(g_pass, p.c_str(), sizeof(g_pass));

  terakhirTersambungMs = millis();

  if (wifiAdaKredensial()) {
    wifiStartOnce();
  } else {
    Serial.println("[WiFi] Belum ada WiFi tersimpan -> membuka portal setup.");
    wifiBukaPortal();
  }
}

void wifiLoop() {
  const uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) terakhirTersambungMs = now;
  else                               wifiEnsure();

  // Tahan tombol BOOT beberapa detik -> buka portal
  static bool     tombolDitekan = false;
  static uint32_t tombolSejak   = 0;
  if (digitalRead(PIN_TOMBOL_SETUP) == LOW) {
    if (!tombolDitekan) { tombolDitekan = true; tombolSejak = now; }
    else if (now - tombolSejak >= TAHAN_TOMBOL_MS && !portalAktif) wifiBukaPortal();
  } else {
    tombolDitekan = false;
  }

  // WiFi tersimpan tapi tidak bisa tersambung lama (password salah / router mati)
  if (!portalAktif && wifiAdaKredensial() && WiFi.status() != WL_CONNECTED &&
      now - terakhirTersambungMs > PORTAL_AUTO_MS) {
    Serial.println("[WiFi] Lama tidak tersambung -> membuka portal setup.");
    wifiBukaPortal();
  }

  if (!portalAktif) return;

  dns.processNextRequest();
  server.handleClient();

  // Tutup portal beberapa detik setelah WiFi baru berhasil tersambung
  if (tutupSetelahTersambung && WiFi.status() == WL_CONNECTED) {
    if (tersambungDiPortalMs == 0) tersambungDiPortalMs = now;
    else if (now - tersambungDiPortalMs >= 8000UL) { wifiTutupPortal(); return; }
  }

  // Batas waktu portal (hanya jika sudah ada WiFi tersimpan)
  if (wifiAdaKredensial() && now - portalMulaiMs >= PORTAL_TIMEOUT_MS) {
    Serial.println("[Portal] Waktu habis.");
    wifiTutupPortal();
  }
}
