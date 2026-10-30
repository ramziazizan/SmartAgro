/*
 * wifi_setup.h - Manajemen WiFi: simpan SSID/password di flash (NVS),
 * koneksi otomatis non-blocking, dan portal setup lewat browser HP/laptop.
 */
#ifndef WIFI_SETUP_H
#define WIFI_SETUP_H

#include <Arduino.h>

// ---- Pengaturan portal (silakan ubah) ----
#define PORTAL_AP_SSID      "SmartAgro-Setup"
#define PORTAL_AP_PASS      "smartagro123"      // minimal 8 karakter
#define PIN_TOMBOL_SETUP    0                   // tombol BOOT di board ESP32
#define TAHAN_TOMBOL_MS     3000UL              // tahan 3 detik -> buka portal
#define PORTAL_TIMEOUT_MS   300000UL            // portal menutup sendiri setelah 5 menit (jika sudah ada WiFi tersimpan)
#define PORTAL_AUTO_MS      120000UL            // WiFi putus 2 menit -> portal dibuka otomatis

void  wifiSetupBegin();                 // panggil sekali di setup()
void  wifiLoop();                       // panggil terus di loop()

bool  wifiAdaKredensial();
bool  wifiSimpanKredensial(const char* ssid, const char* pass);  // validasi + simpan + sambung ulang
void  wifiHapusKredensial();

void  wifiBukaPortal();
void  wifiTutupPortal();
bool  wifiPortalAktif();

const char* wifiSsidTersimpan();

#endif
