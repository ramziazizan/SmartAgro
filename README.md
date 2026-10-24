# Smart Agro Dashboard

Dashboard React/Vite menampilkan telemetry terbaru dari Google Sheets CSV (fallback), prakiraan cuaca Open-Meteo, dan data telemetry live dari MQTT ketika dashboard sudah login. Kontrol pompa menggunakan API backend yang meneruskan perintah ke broker MQTT melalui koneksi TLS.

## Arsitektur

```text
Browser (React) --HTTPS/Bearer token--> Backend API --MQTTS--> MQTT broker <--MQTTS-- ESP32
```

Kredensial broker hanya berada pada backend. Jangan menaruh password broker, token broker, atau signing secret di `VITE_*`, file source frontend, atau GitHub Pages variables. Frontend hanya menerima URL publik backend dan token sesi sementara setelah pengguna login.

## Menjalankan lokal

Pasang dependency frontend:

```sh
npm ci
```

Salin `backend/.env.example` menjadi `backend/.env` lalu isi konfigurasi. Jalankan backend dan frontend di dua terminal dari root project:

```sh
npm run dev:api
npm run dev
```

Frontend memakai `http://localhost:3001` secara default. Untuk override, salin `.env.example` ke `.env.local` lalu atur `VITE_API_BASE_URL`. File `.env`, `.env.local`, dan `backend/.env` diabaikan Git.

Jalankan pemeriksaan:

```sh
npm run lint
npm run build
npm run test:api
```

## Konfigurasi backend dan broker

Salin `backend/.env.example` menjadi `backend/.env` dan isi:

- `MQTT_BROKER_URL`: hostname endpoint koneksi MQTT dari EMQX Cloud, dengan format `mqtts://<hostname>:8883`. Gunakan endpoint dan port TLS yang ditampilkan di detail deployment; jangan gunakan URL dashboard EMQX atau alamat WebSocket.
- `MQTT_USERNAME` / `MQTT_PASSWORD`: credential MQTT yang dibuat pada deployment EMQX. Buat credential khusus backend; jangan gunakan credential pribadi atau menaruhnya di frontend.
- `MQTT_CLIENT_ID`: client ID unik backend.
- `MQTT_TOPIC_PREFIX` / `MQTT_DEVICE_ID`: harus sama dengan yang dipakai firmware.
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`: akun login dashboard. Gunakan password unik minimal 12 karakter.
- `AUTH_TOKEN_SECRET`: random secret minimal 32 karakter untuk token API sesi 1 jam.
- `FRONTEND_ORIGINS`: origin lengkap frontend yang diizinkan, pisahkan beberapa origin dengan koma.

Backend menolak broker non-TLS, memvalidasi autentikasi dashboard, membatasi percobaan login, dan menerapkan CORS berdasarkan origin yang diizinkan. Token dashboard hanya disimpan di memori frontend dan kedaluwarsa setelah satu jam.

### Langkah EMQX Cloud Serverless

1. Buka deployment Serverless di EMQX Cloud, lalu salin **MQTT connection endpoint/hostname** dan port TLS dari halaman detail koneksi. Pastikan alamatnya untuk koneksi MQTT/TLS, bukan endpoint WebSocket atau alamat halaman dashboard.
2. Di pengaturan autentikasi deployment, aktifkan autentikasi username/password bila belum aktif, lalu buat username dan password MQTT. Simpan password dengan aman; jangan kirim atau commit ke repository.
3. Jika deployment menyediakan pengaturan authorization/ACL, batasi credential backend agar hanya dapat subscribe ke `<prefix>/<device-id>/status/pump` dan `<prefix>/<device-id>/telemetry`, serta publish ke `<prefix>/<device-id>/command/pump`. Buat credential ESP32 terpisah dengan izin publish status/telemetry dan subscribe command. Jika ACL belum dikonfigurasi, pastikan setidaknya autentikasi broker aktif dan jangan gunakan credential admin.
4. Isi `backend/.env` lokal (atau environment variables di hosting backend). Contoh, ganti hostname dengan nilai dari console EMQX dan isi credential hanya di mesin/hosting backend:

   ```dotenv
   MQTT_BROKER_URL=mqtts://<hostname-dari-emqx>:8883
   MQTT_USERNAME=<username-backend>
   MQTT_PASSWORD=<password-backend>
   MQTT_CLIENT_ID=smart-agro-backend-unik
   MQTT_TOPIC_PREFIX=smartagro
   MQTT_DEVICE_ID=esp32-01
   ```

5. Pastikan `MQTT_CLIENT_ID` backend berbeda dari client ID ESP32. Topic harus sama persis dengan firmware; nilai default repo menghasilkan topic `smartagro/esp32-01/command/pump`, `smartagro/esp32-01/status/pump`, dan `smartagro/esp32-01/telemetry`.
6. Jalankan backend dengan `npm run dev:api`. Periksa `http://localhost:3001/api/health`: respons `mqtt.configured` harus `true` dan `mqtt.connected` menjadi `true`. Jika tidak terhubung, periksa hostname/port TLS, username/password, konfigurasi autentikasi/ACL, serta aturan network access di deployment EMQX.

Jangan menambahkan `MQTT_*`, `DASHBOARD_PASSWORD`, atau `AUTH_TOKEN_SECRET` ke `.env` frontend, `VITE_*`, GitHub Pages, maupun chat. Untuk deployment, masukkan secret MQTT hanya ke environment variables hosting backend. `FRONTEND_ORIGINS` dan `VITE_API_BASE_URL` tetap dikonfigurasi terpisah dari EMQX.

## Kontrak MQTT untuk firmware ESP32

Topic perangkat default:

| Arah | Topic | Payload |
| --- | --- | --- |
| Backend → ESP32 | `smartagro/esp32-01/command/pump` | Teks `ON` atau `OFF`; QoS 1, tidak retained |
| ESP32 → Backend | `smartagro/esp32-01/status/pump` | JSON, contoh `{"online":true,"pumpOn":true,"updatedAt":1790000000000}`. Jika status pompa belum diketahui, kirim `{"online":true,"pumpOn":null,"updatedAt":1790000000000}`. |
| ESP32 → Backend | `smartagro/esp32-01/telemetry` | JSON dengan `timestamp`, `ph`, `temperature`, `ec`, `moisture`, `nitrogen`, `phosphorus`, `potassium`, `deviceId` |

ESP32 perlu subscribe ke topic perintah dan publish status/telemetry secara berkala menggunakan MQTTS. Backend menandai perangkat online jika pesan status JSON valid diterima dalam 20 detik terakhir; `pumpOn` dapat berupa `true`, `false`, atau `null` jika status pompa belum diketahui. Pesan `{"online":false,"pumpOn":null}` menandai perangkat offline. Nilai sensor yang belum tersedia sebaiknya dikirim sebagai `null` pada payload telemetry; itu tidak menggantikan heartbeat status. Telemetry MQTT yang lebih lama dari 60 detik tidak dipakai dashboard; CSV Google Sheets tetap menjadi fallback.

Mintalah teman yang mengurus firmware untuk mengonfirmasi topic, format payload status, interval heartbeat, serta dukungan TLS/autentikasi. Sesuaikan variabel konfigurasi/topik firmware sebelum deployment.

### Firmware empat pompa

Folder `firmware/esp32-smart-agro/` berisi sketch Arduino IDE yang memakai satu perintah `ON`/`OFF` untuk mengendalikan keempat relay bersama pada GPIO 27, 26, 32, dan 33. Sketch mengirim heartbeat status berkala ke topic backend. Sketch ini tidak mengirim telemetry sensor; tambahkan pembacaan sensor yang sesuai sebelum mengharapkan nilai metrik MQTT.

1. Salin `firmware/esp32-smart-agro/secrets.example.h` menjadi `firmware/esp32-smart-agro/secrets.h`.
2. Isi nama/password Wi-Fi dan username/password MQTT khusus ESP32 di `secrets.h`. File `secrets.h` diabaikan Git; jangan commit atau bagikan file tersebut.
3. Buka `firmware/esp32-smart-agro/esp32-smart-agro.ino` di Arduino IDE dan pasang library `PubSubClient` serta `ArduinoJson`.
4. Pastikan credential MQTT ESP32 memiliki izin subscribe ke topic command dan publish ke topic status yang tercantum di atas. MQTT Client ID ESP32 sudah dibedakan dari backend.
5. Pilih board/port ESP32 yang benar, upload, lalu buka Serial Monitor pada 115200 baud. Uji relay dengan hati-hati tanpa menghubungkan beban pompa terlebih dahulu; pastikan level aktif relay cocok dengan `RELAY_ACTIVE_LOW`.

`secureClient.setInsecure()` disediakan hanya untuk pengujian awal TLS dan tidak memvalidasi sertifikat broker. Untuk penggunaan permanen, ganti dengan verifikasi sertifikat CA EMQX. Jangan hubungkan pompa bermuatan listrik sebelum rangkaian, catu daya, relay, dan kondisi fail-safe diperiksa teknisi yang kompeten.

## Deployment

Deploy backend ke layanan Node.js yang menyediakan HTTPS, misalnya Render, Railway, atau VM dengan reverse proxy TLS. Masukkan seluruh nilai dari `backend/.env.example` sebagai environment variables rahasia pada layanan hosting. Jangan commit file `.env`.

Untuk frontend GitHub Pages, tambahkan `VITE_API_BASE_URL` (URL HTTPS backend) sebagai **Actions variable** di repository. Tambahkan origin `https://<username>.github.io` pada `FRONTEND_ORIGINS` backend, lalu deploy ulang frontend. URL API bukan secret; credential broker tetap hanya di environment backend.

## Data sensor dan penyimpanan

Google Sheets tetap menjadi sumber penyimpanan yang dibaca langsung oleh frontend, bukan database relasional. MQTT broker meneruskan pesan dan backend menyimpan status terbaru hanya di memori; sistem ini belum menyimpan riwayat telemetry MQTT. Jika ingin semua telemetry MQTT dicatat ke Sheets atau database, tambahkan integrasi penyimpanan pada backend.

Refresh CSV otomatis berjalan setiap 30 detik. Prediksi cuaca menggunakan Open-Meteo di koordinat Medan (3.5952, 98.6722).
