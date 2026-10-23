# Smart Agro Dashboard

Dashboard ini adalah React SPA yang dijalankan dengan Vite. Tidak memerlukan Express atau database; data sensor terbaru dibaca langsung dari CSV Google Sheets, sedangkan prakiraan cuaca diambil dari Open-Meteo.

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Jalankan perintah dari direktori project ini.


## Data dan keputusan otomatisasi

CSV spreadsheet dibaca berdasarkan urutan kolom: Timestamp, pH, suhu, EC, kelembapan, N, P, K, dan Device ID. Data diperbarui otomatis setiap 30 detik dan dapat diperbarui manual melalui tombol **Refresh**.

Prakiraan per jam Open-Meteo menggunakan koordinat Kota Medan (3.5952, 98.6722). Sistem menampilkan `Pompa Hidup` jika kelembapan di bawah 40% dan cuaca tidak diprediksi hujan, `Pompa Mati (Prakiraan Hujan)` jika kelembapan di bawah 40% dan hujan diprediksi, serta `Pompa Mati` jika kelembapan minimal 40%.

## Kontrol manual ESP32

Panel kontrol membaca endpoint `/status` setiap 4 detik dan mengirim perintah `ON` atau `OFF` ke endpoint `/pump`. Masukkan alamat IPv4 ESP32 pada panel kontrol lalu pilih **Simpan & Hubungkan**; alamat tersebut disimpan di browser untuk kunjungan berikutnya. Perangkat ESP32 harus terhubung ke jaringan yang dapat dijangkau browser, menyediakan endpoint tersebut, serta mengizinkan request browser melalui CORS. Kontrol HTTP ke IP lokal dapat diblokir browser jika dashboard dibuka melalui HTTPS (termasuk GitHub Pages); untuk akses dari deployment HTTPS, ESP32 perlu menyediakan koneksi HTTPS yang dipercaya browser atau request harus melalui service/proxy HTTPS tepercaya.
