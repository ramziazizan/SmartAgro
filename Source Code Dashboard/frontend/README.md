# Smart Agro Dev

## Deskripsi Proyek

Smart Agro adalah sistem pemantauan kondisi tanaman dan pengendalian pompa berbasis ESP32. Sistem ini menggabungkan perangkat sensor, dashboard web, Google Sheets, prakiraan cuaca Open-Meteo, dan komunikasi MQTT.

Dashboard menampilkan data kelembapan tanah, suhu, pH, EC, nitrogen, fosfor, kalium, serta identitas perangkat jika datanya tersedia. Dashboard juga menampilkan prakiraan cuaca dan rekomendasi tindakan penyiraman.

## Latar Belakang dan Tujuan

Penyiraman yang tidak sesuai kebutuhan dapat membuat tanaman kekurangan air atau menggunakan air secara berlebihan. Pemeriksaan kondisi tanaman secara manual juga menyulitkan pemantauan berkelanjutan.

Smart Agro dibuat untuk membantu memantau kondisi tanaman melalui satu dashboard, mempertimbangkan kelembapan tanah dan prakiraan hujan saat memberikan rekomendasi, serta menyediakan kendali pompa dari jarak jauh melalui MQTT. Tujuannya adalah membantu pengguna mengambil keputusan penyiraman dengan informasi yang lebih mudah diakses.

## Cara Kerja Sistem

### Perangkat

1. ESP32 terhubung ke Wi-Fi dan broker MQTT menggunakan koneksi TLS.
2. ESP32 menerima perintah pompa `ON` atau `OFF` dari broker MQTT.
3. Satu perintah mengendalikan satu relay di pin GPIO 26
4. ESP32 mengirimkan status online dan status pompa ke broker secara berkala.

Sketch firmware yang tersedia saat ini menangani koneksi MQTT dan kendali empat relay. Sketch tersebut belum membaca sensor atau mengirim telemetry sensor. Dashboard membaca data sensor dari Google Sheets CSV, dan dapat memakai telemetry MQTT apabila perangkat lain mengirimkannya dengan format yang didukung.

### Dashboard

1. Aplikasi React mengambil baris data terbaru dari Google Sheets melalui URL ekspor CSV.
2. Aplikasi mengambil prakiraan cuaca dari Open-Meteo untuk koordinat Medan.
3. Data dan rekomendasi dashboard diperbarui setiap 15 detik.
4. Sistem menampilkan rekomendasi berdasarkan kelembapan tanah dan prakiraan cuaca:
   - Kelembapan di bawah 40% dan cuaca cerah: rekomendasi pompa hidup.
   - Kelembapan di bawah 40% dan diprediksi hujan: rekomendasi pompa mati.
   - Kelembapan 40% atau lebih: rekomendasi pompa mati.
5. Untuk melihat status perangkat dan mengirim kendali pompa, pengguna login pada panel MQTT. API meneruskan perintah ke broker, lalu ESP32 mengendalikan keempat relay.

**Catatan:** rekomendasi berdasarkan sensor dan cuaca hanya ditampilkan di dashboard; rekomendasi tersebut belum otomatis mengirim perintah ON/OFF. Pompa dikendalikan melalui panel kontrol secara manual.

## Cara Menjalankan Sistem

### Menjalankan dashboard dan API secara lokal

Persyaratan: Node.js versi 20 atau lebih baru dan npm.

1. Clone repository dan buka terminal di `Source Code Dashboard/frontend`.
2. Pasang dependency frontend:

   ```sh
   npm ci
   ```

3. Jika ingin menggunakan fitur MQTT, salin `backend/.env.example` menjadi `backend/.env`, kemudian isi konfigurasi broker MQTT dan akun dashboard. Jangan masukkan kredensial ke source code atau commit file `.env`.
4. Jalankan backend lokal di terminal pertama:

   ```sh
   npm run dev:api
   ```

5. Jalankan dashboard di terminal kedua:

   ```sh
   npm run dev
   ```

6. Buka alamat lokal yang ditampilkan Vite di terminal. Dashboard dapat menampilkan data CSV dan cuaca; fitur status serta kendali pompa membutuhkan konfigurasi broker dan login MQTT yang valid.

Vite meneruskan request `/api` ke backend lokal di `http://localhost:3001`. Untuk memeriksa kualitas kode dan build, jalankan:

```sh
npm run lint
npm run build
npm run test:api
```

### Menyiapkan ESP32 dan pompa

1. Salin `firmware/esp32-smart-agro/secrets.example.h` menjadi `firmware/esp32-smart-agro/secrets.h`.
2. Isi nama dan password Wi-Fi serta kredensial MQTT khusus ESP32 di `secrets.h`. Jangan membagikan atau mengunggah file yang berisi kredensial.
3. Buka `firmware/esp32-smart-agro/esp32-smart-agro.ino` di Arduino IDE dan pasang library `PubSubClient` serta `ArduinoJson`.
4. Pilih board dan port ESP32 yang sesuai, lalu unggah sketch.
5. Periksa Serial Monitor pada 115200 baud untuk melihat status koneksi.
6. Pastikan GPIO relay dan jenis modul relay sesuai. Uji rangkaian tanpa beban pompa terlebih dahulu; pemasangan pompa listrik harus dilakukan dengan memperhatikan keselamatan dan isolasi yang tepat.

ESP32 dan API harus menggunakan kredensial broker serta topic MQTT yang sesuai. Topic default project adalah:

| Arah komunikasi | Topic |
| --- | --- |
| API ke ESP32 (perintah pompa) | `smartagro/esp32-01/command/pump` |
| ESP32 ke broker (status pompa) | `smartagro/esp32-01/status/pump` |
| Telemetry sensor jika dikirim perangkat | `smartagro/esp32-01/telemetry` |

### Menjalankan versi online

Project dikonfigurasi sebagai satu deployment Vercel: frontend Vite dibuat ke `dist`, sedangkan `api/[...path].js` meneruskan request `/api/*` ke API serverless. Saat menghubungkan repository ke Vercel, atur **Root Directory** ke `Source Code Dashboard/frontend`.

Tambahkan environment variables berikut pada pengaturan Vercel untuk mengaktifkan MQTT dan login dashboard:

- `VITE_SHEETS_CSV_URL` (URL CSV Google Sheets yang memang boleh diakses publik; variabel `VITE_*` akan terlihat di browser)
- `MQTT_BROKER_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`
- `AUTH_TOKEN_SECRET` (minimal 32 karakter acak)
- `FRONTEND_ORIGINS` (origin deployment dashboard; pisahkan beberapa origin dengan koma)
- `MQTT_CLIENT_ID`, `MQTT_TOPIC_PREFIX`, dan `MQTT_DEVICE_ID` bila ingin mengganti nilai default

Jangan masukkan kredensial ke source code atau commit file `.env`/`secrets.h`. Folder `Source Code Tools IoT` disimpan dalam repository yang sama, tetapi firmware `.ino` tidak dideploy ke Vercel. Salin `Source Code Tools IoT/secrets.example.h` menjadi `Source Code Tools IoT/secrets.h` dan isi hanya file lokal tersebut; file credential sudah di-ignore oleh Git. Nilai Wi-Fi, MQTT, dan URL Apps Script yang pernah tertanam di sketch lama harus dirotasi sebelum digunakan kembali. Pastikan Google Sheets hanya berisi data yang memang boleh dibaca oleh dashboard publik.

Untuk development lokal, salin `.env.example` menjadi `.env` di folder `Source Code Dashboard/frontend` dan isi `VITE_SHEETS_CSV_URL` dengan URL CSV publik. URL tersebut sengaja tidak disimpan di source code; jangan gunakan variabel `VITE_*` untuk nilai rahasia.

## Anggota Tim

- Ramzi Azizan
- M. Taufan Pasya Lubis
- Amanda Putri Rizkita
