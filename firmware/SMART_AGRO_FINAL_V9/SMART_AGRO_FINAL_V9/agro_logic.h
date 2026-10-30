/*
 * agro_logic.h  -  Logika murni (bahasa C) untuk SMART AGRO
 *
 * Isi file ini TIDAK bergantung pada Arduino (tanpa Serial, String, WiFi, dll),
 * sehingga bisa diuji di komputer dengan gcc biasa.
 */
#ifndef AGRO_LOGIC_H
#define AGRO_LOGIC_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---------------- Modbus RTU ---------------- */
uint16_t agro_crc16(const uint8_t* b, uint16_t n);

/* Isi frame "Read Holding Registers" (fungsi 0x03) sepanjang 8 byte. */
void agro_modbus_buat_baca(uint8_t sid, uint16_t start, uint16_t count, uint8_t out[8]);

/* Urai balasan Modbus. true jika CRC, ID, fungsi, dan jumlah byte valid.
 * Byte sampah di depan frame otomatis dilewati. */
bool agro_modbus_urai_balasan(const uint8_t* buf, uint16_t n, uint8_t sid,
                              uint16_t count, uint16_t* out);

/* Konversi nilai register mentah -> satuan sebenarnya */
float agro_skala_ph(uint16_t raw);      /* /100 */
float agro_skala_suhu(uint16_t raw);    /* /10  */
float agro_skala_lembab(uint16_t raw);  /* /10  */
float agro_tds_dari_ec(float ec);       /* estimasi kasar: EC x 0.5 (NaN tetap NaN) */
bool  agro_semua_nan(const float* v, size_t n);

/* ---------------- Pompa / relay ---------------- */
/* Level pin untuk relay: 1 = HIGH, 0 = LOW */
int  agro_relay_level(bool nyala, bool active_low);
/* Mode relay (bisa diganti lewat Serial: RELAY=0/1/2)
 *  0 = modul aktif-LOW  : ON = pin LOW,   OFF = pin HIGH
 *  1 = aktif-LOW, "open-drain": ON = pin LOW, OFF = pin DILEPAS (INPUT).
 *      Untuk modul relay 5V yang tidak bisa dimatikan oleh sinyal HIGH 3.3V ESP32.
 *  2 = modul aktif-HIGH : ON = pin HIGH,  OFF = pin LOW */
typedef enum { AGRO_PIN_LOW = 0, AGRO_PIN_HIGH = 1, AGRO_PIN_LEPAS = 2 } agro_pin_aksi_t;
#define AGRO_RELAY_MODE_MAKS 2
agro_pin_aksi_t agro_relay_aksi(bool nyala, uint8_t mode);

/* true jika pompa menyala dan sudah melewati batas waktu (aman terhadap overflow millis) */
bool agro_pompa_timeout(bool sedang_on, uint32_t mulai_ms, uint32_t sekarang_ms, uint32_t maks_ms);

/* ---------------- Perintah MQTT ---------------- */
typedef enum {
  AGRO_CMD_ABAIKAN = 0,      /* topik bukan topik perintah pompa */
  AGRO_CMD_VALID,            /* *target dan *nyala terisi */
  AGRO_CMD_TIDAK_DIKENAL     /* topik benar, tapi isi bukan ON/OFF */
} agro_cmd_hasil_t;

/* target: -1 = semua channel, 0..jumlah-1 = satu channel */
agro_cmd_hasil_t agro_parse_perintah(const char* topik, const char* topik_semua,
                                     const char* prefix_ch, uint8_t jumlah,
                                     const uint8_t* payload, unsigned int len,
                                     int* target, bool* nyala);

/* ---------------- HTTP / Google Sheets ---------------- */
/* Pisah "https://host/path?x=y" -> host dan "/path?x=y".
 * 0 = ok, -10 = tidak ada "://", -11 = tidak ada path, -12 = buffer kurang. */
int  agro_url_pisah(const char* url, char* host, size_t host_len, char* path, size_t path_len);
/* Kode status dari baris pertama respons ("HTTP/1.1 302 ..."). -2 jika tidak valid. */
int  agro_http_status(const char* resp);
bool agro_http_redirect(int kode);
/* Ambil nilai header (tidak peka huruf besar/kecil). */
bool agro_http_header(const char* resp, const char* nama, char* out, size_t out_len);
/* Pointer ke awal body (setelah baris kosong); jika tidak ada, mengembalikan resp. */
const char* agro_http_body(const char* resp);
/* Encode teks untuk dipakai di URL. false jika buffer tidak cukup. */
bool agro_url_encode(const char* in, char* out, size_t out_len);
/* Bangun URL: base?ph=..&temp=..&ec=..&moist=..&N=..&P=..&K=..&dev=..
 * Nilai NaN dikirim kosong. Mengembalikan panjang URL, atau -1 jika buffer kurang. */
int  agro_buat_url_sheets(char* out, size_t out_len, const char* base,
                          float ph, float suhu, float ec, float lembab,
                          float n, float p, float k, const char* dev);

/* ---------------- Tampilan ---------------- */
/* Tulis angka + satuan ke buf; NaN ditulis "--". */
void agro_fmt_nilai(char* buf, size_t len, float v, int desimal, const char* satuan);

/* ---------------- WiFi: validasi & perintah Serial ---------------- */
bool agro_ssid_valid(const char* ssid);   /* 1..32 byte */
bool agro_pass_valid(const char* pass);   /* kosong (jaringan terbuka) atau 8..63 byte */

typedef enum {
  AGRO_SER_KOSONG = 0,
  AGRO_SER_SSID,        /* SSID=nama jaringan   */
  AGRO_SER_PASS,        /* PASS=kata sandi      */
  AGRO_SER_HAPUS,       /* WIFIRESET            */
  AGRO_SER_PORTAL,      /* PORTAL               */
  AGRO_SER_STATUS,      /* STATUS               */
  AGRO_SER_RELAY,       /* RELAY=0|1|2          */
  AGRO_SER_TES_RELAY,   /* TESRELAY             */
  AGRO_SER_BANTUAN,     /* HELP                 */
  AGRO_SER_TIDAK_DIKENAL
} agro_ser_t;

/* Urai satu baris perintah Serial. 'line' akan diubah (CR/LF dibuang).
 * *nilai menunjuk ke bagian nilai (untuk SSID= / PASS=), di dalam 'line'. */
agro_ser_t agro_parse_serial(char* line, const char** nilai);

#ifdef __cplusplus
}
#endif

#endif /* AGRO_LOGIC_H */
