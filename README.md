# Smart Agro Dashboard

Dashboard ini adalah React SPA yang dijalankan dengan Vite. Tidak memerlukan Express atau database; data sensor terbaru dibaca langsung dari CSV Google Sheets, sedangkan prakiraan cuaca diambil dari Open-Meteo.

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Jalankan perintah dari direktori `frontend`.

## Data dan keputusan otomatisasi

CSV spreadsheet dibaca berdasarkan urutan kolom: Timestamp, pH, suhu, EC, kelembapan, N, P, K, dan Device ID. Data diperbarui otomatis setiap 30 detik dan dapat diperbarui manual melalui tombol **Refresh**.

Prakiraan per jam Open-Meteo menggunakan koordinat Kota Medan (3.5952, 98.6722). Sistem menampilkan `Pompa Hidup` jika kelembapan di bawah 40% dan cuaca tidak diprediksi hujan, `Pompa Mati (Prakiraan Hujan)` jika kelembapan di bawah 40% dan hujan diprediksi, serta `Pompa Mati` jika kelembapan minimal 40%.
