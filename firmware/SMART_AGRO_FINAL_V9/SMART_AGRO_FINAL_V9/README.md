# SMART AGRO V8

Firmware ESP32 untuk monitoring tanah dan kontrol pompa. Membaca sensor tanah (pH, suhu, kelembapan, EC, N, P, K) lewat RS485/Modbus, menampilkannya di OLED, mengirim data ke MQTT dan Google Sheets, serta mengontrol 4 pompa lewat relay.

Pada V8, SSID dan password WiFi **tidak lagi ditulis di kode**. Keduanya diisi lewat portal web atau Serial Monitor dan disimpan di flash ESP32.

## Struktur file

```
SMART_AGRO_FINAL_V8/
├── SMART_AGRO_FINAL_V8.ino   Program utama (hardware, MQTT, OLED, loop)
├── agro_logic.c / .h         Logika murni dalam C (tanpa library Arduino)
└── wifi_setup.cpp / .h       Penyimpanan WiFi, koneksi otomatis, portal setup
```

Kelima file harus berada dalam **satu folder** yang namanya sama dengan file `.ino` (`SMART_AGRO_FINAL_V8`). Jika tidak, Arduino IDE tidak akan ikut mengompilasi file `.c` dan `.cpp`.

Isi `agro_logic.c`: CRC dan frame Modbus, parsing perintah MQTT, logika timeout pompa dan level relay, parsing URL dan respons HTTP, pembuat URL Google Sheets, format teks OLED, validasi SSID/password, dan parser perintah Serial.

## Kebutuhan

**Board:** ESP32 (Arduino-ESP32 core), pilih `ESP32 Dev Module`.

**Library** (Library Manager):

| Library | Keterangan |
|---|---|
| Adafruit GFX Library | OLED |
| Adafruit SSD1306 | OLED |
| PubSubClient | MQTT |
| ArduinoJson | **versi 7** (kode memakai `JsonDocument`) |

`WiFi`, `WebServer`, `DNSServer`, `Preferences`, dan `HTTPClient` sudah termasuk dalam core ESP32.

**Pengaturan Arduino IDE:** jika muncul error `Sketch too big`, ubah **Tools → Partition Scheme** ke `Huge APP (3MB No OTA)`.

## Wiring

| Komponen | Pin ESP32 |
|---|---|
| Relay IN1 – IN4 (aktif LOW) | GPIO 15, 26, 32, 33 |
| RS485 DI (TX) | GPIO 17 |
| RS485 RO (RX) | GPIO 16 |
| RS485 DE + RE (disatukan) | GPIO 4 |
| OLED SSD1306 (I2C, alamat 0x3C) | SDA GPIO 21, SCL GPIO 22 |
| LED indikator WiFi | GPIO 2 (LED bawaan) |
| Tombol setup | GPIO 0 (tombol BOOT) |

Pin dapat diubah di bagian atas file `.ino`.

**Catatan daya dan sinyal**

- Modul RS485 MAX485 memakai VCC **5 V**. Pin RO mengeluarkan sinyal 5 V, jadi pasang pembagi tegangan (misalnya 1 kΩ seri dan 2 kΩ ke GND) sebelum masuk ke GPIO16.
- Satukan semua GND (ESP32, modul RS485, relay, sensor).
- Pasang dioda flyback (misalnya 1N4007) pada pompa DC dan kapasitor dekat VIN ESP32 untuk meredam noise.
- Jika memakai modul breadboard power supply, ambil 5 V lewat **port USB** modul. Jack barel dengan input 5 V menghasilkan rel 5 V yang turun menjadi sekitar 4 V.

**Sensor tanah:** Modbus RTU, ID 1, 9600 baud, 8E1.

## Mengatur WiFi

Belum ada WiFi tersimpan, atau ingin menggantinya? Ada dua cara.

### 1. Portal web (lewat HP)

Portal terbuka otomatis jika belum ada WiFi tersimpan. Portal juga bisa dibuka dengan cara berikut:

- menahan tombol **BOOT** selama 3 detik,
- mengetik `PORTAL` di Serial Monitor,
- atau otomatis jika WiFi tersimpan tidak bisa tersambung selama 2 menit.

Langkahnya:

1. Sambungkan HP ke WiFi **`SmartAgro-Setup`** (password `smartagro123`).
2. Buka browser ke **`http://192.168.4.1`** (alamat ini selalu tetap).
3. Ketuk salah satu jaringan yang terdeteksi atau ketik nama WiFi secara manual.
4. Isi password (kosongkan jika WiFi tanpa password), lalu tekan **Simpan & Sambungkan**.

Setelah WiFi berhasil tersambung, jaringan `SmartAgro-Setup` hilang sendiri. Selama portal aktif, layar OLED menampilkan petunjuk dan LED GPIO2 berkedip cepat. Jika sudah ada WiFi tersimpan, portal menutup sendiri setelah 5 menit.

### 2. Serial Monitor

Buka Serial Monitor dengan baud **115200** dan Line ending **Newline**.

| Perintah | Fungsi |
|---|---|
| `SSID=<nama wifi>` | Atur nama WiFi (boleh ada spasi) |
| `PASS=<password>` | Atur password dan langsung menyambung (kosong = WiFi terbuka) |
| `PORTAL` | Buka portal setup |
| `WIFIRESET` | Hapus WiFi tersimpan dan buka portal |
| `STATUS` | Tampilkan status WiFi, MQTT, sensor, relay, dan pompa |
| `RELAY=0` / `1` / `2` | Pilih mode relay (lihat bagian "Mode relay"), tersimpan di flash |
| `TESRELAY` | Menyalakan relay 1–4 bergantian untuk uji (lepas pompa dulu) |
| `HELP` | Tampilkan daftar perintah |

Contoh:

```
SSID=RumahKu
PASS=rahasia123
```

Aturan: SSID 1–32 karakter, password 8–63 karakter (atau kosong).

### Mengosongkan seluruh flash

Untuk menghapus semua data termasuk WiFi, aktifkan **Tools → Erase All Flash Before Sketch Upload** lalu upload ulang, atau jalankan `esptool.py --port COMx erase_flash`. Kembalikan opsi erase ke *Disabled* setelahnya.

## Mode relay

Modul relay berbeda-beda cara kerjanya. Mode dipilih lewat Serial Monitor (tanpa upload ulang) dan tersimpan di flash. Nilai awalnya adalah **mode 1**.

| Mode | Perintah | ON | OFF | Dipakai untuk |
|---|---|---|---|---|
| 0 | `RELAY=0` | pin LOW | pin HIGH | Modul aktif-LOW biasa |
| 1 | `RELAY=1` | pin LOW | pin dilepas (INPUT) | Modul aktif-LOW 5 V yang tidak mati oleh sinyal HIGH 3,3 V (relay ON terus) |
| 2 | `RELAY=2` | pin HIGH | pin LOW | Modul aktif-HIGH (jumper trigger di posisi H) |

Cara mencari mode yang cocok: **lepas pompa dari relay**, ketik `TESRELAY`, lalu amati. Pada mode yang benar, relay mati saat diam dan menyala satu per satu saat tes. Jika terbalik atau menyala terus, coba mode berikutnya.

## MQTT

Broker memakai TLS pada port 8883 (host, user, dan password diatur di `.ino`).

| Topik | Arah | Isi |
|---|---|---|
| `smartagro/esp32-01/telemetry` | publish | JSON data sensor setiap 10 detik |
| `smartagro/esp32-01/command/pump` | subscribe | `ON` / `OFF` untuk **semua** pompa |
| `smartagro/esp32-01/command/pump/1` … `/4` | subscribe | `ON` / `OFF` untuk satu pompa |
| `smartagro/esp32-01/status/pump` | publish | Ringkasan status semua pompa |
| `smartagro/esp32-01/status/pump/1` … `/4` | publish | Status tiap pompa |

Isi telemetri: `deviceId`, `temperature`, `moisture`, `ph`, `ec`, `nitrogen`, `phosphorus`, `potassium`, `tds` (estimasi kasar: EC × 0,5). Sensor yang gagal dibaca dikirim sebagai `null`.

## Fitur pengaman

- Client ID MQTT (`MQTT_CLIENT_ID`) harus **unik** per perangkat. Jangan memakai ID yang sama dengan backend/dashboard, karena keduanya akan saling memutus koneksi.
- Setiap pompa mati otomatis setelah **30 menit** menyala (`MAX_RUN_MS`).
- Semua relay dalam keadaan OFF saat startup.
- Balasan sensor diperiksa CRC. Data rusak karena noise ditolak, tidak dikirim sebagai angka palsu, dan ditampilkan `--` di OLED.
- Data tidak dikirim ke Google Sheets jika semua sensor gagal dibaca.

## Indikator

| Indikator | Arti |
|---|---|
| LED GPIO2 menyala | WiFi terhubung |
| LED GPIO2 berkedip cepat | Portal setup aktif |
| OLED `PMP:0000` | Status pompa 1–4 (1 = nyala) |
| OLED `MQTT OK` / `MQTT --` | Status koneksi MQTT |
| OLED `WIFI OK` / `WIFI --` | Status koneksi WiFi |

## Pemecahan masalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Nilai sensor `--` terus | Kabel A/B RS485 tertukar, sensor tanpa daya, atau pin DE/RE salah |
| Relay selalu ON | Mode relay tidak cocok dengan modul: lepas pompa, ketik `RELAY=0`, `RELAY=1`, atau `RELAY=2` lalu `TESRELAY`. Cek juga VCC modul = 5 V, GND disatukan, dan jumper JD-VCC |
| Error `missing terminating " character` saat compile | Ada tanda kutip penutup yang hilang, biasanya di baris konfigurasi atas (contoh: `"nama;` seharusnya `"nama";`) |
| Upload berhenti sekitar 95% (`No more data to read from the serial port`) | Kabel USB buruk atau daya kurang: ganti kabel, turunkan Upload Speed ke 115200, lepas relay/RS485 saat upload |
| ESP32 sering restart saat pompa nyala | Catu daya kurang kuat atau noise dari pompa (pasang dioda flyback dan kapasitor) |
| Halaman portal tidak terbuka | Ketik `http://192.168.4.1` manual (bukan `https`) dan pilih tetap tersambung jika HP menanyakan "tanpa internet" |
| Tidak mau tersambung ke WiFi | Password salah atau WiFi 5 GHz (ESP32 hanya mendukung 2,4 GHz) |
| MQTT tidak terhubung | Cek host, user, password, dan koneksi internet |
| Google Sheets gagal terkirim | Deployment Apps Script harus diatur `Who has access = Anyone`, lalu deploy versi baru |
| `Sketch too big` | Ubah Partition Scheme ke `Huge APP (3MB No OTA)` |

## Catatan keamanan

- Host, user, dan password MQTT serta URL Google Script masih tertulis di `.ino`. Jangan membagikan file ini ke publik tanpa mengganti kredensial tersebut.
- Password portal (`smartagro123`) dan nama AP dapat diubah di `wifi_setup.h`.
- Koneksi TLS memakai `setInsecure()` (sertifikat server tidak diverifikasi). Itu hanya cocok untuk pengujian. Untuk pemakaian sebenarnya, gunakan `setCACert()`.
- WiFi dan password disimpan di flash tanpa enkripsi.

## Pengujian logika C

`agro_logic.c` tidak bergantung pada Arduino, sehingga bisa diuji di komputer dengan gcc:

```
gcc -std=c99 -Wall -Wextra -I. tes.c agro_logic.c -lm -o tes && ./tes
```

## Riwayat versi

- **V8:** WiFi diatur lewat portal web dan Serial (disimpan di flash), logika dipindah ke `agro_logic.c`, UI portal bertema dashboard, mode relay bisa diganti lewat Serial (`RELAY=`, `TESRELAY`), dan nilai kosong tampil `--` di OLED.
- **V7:** SSID dan password masih ditulis langsung di kode.
