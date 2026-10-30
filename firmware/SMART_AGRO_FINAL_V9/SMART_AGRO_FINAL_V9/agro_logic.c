/*
 * agro_logic.c  -  Logika murni (bahasa C) untuk SMART AGRO
 */
#include "agro_logic.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---------------- helper internal ---------------- */
static char huruf_kecil(char c) { return (c >= 'A' && c <= 'Z') ? (char)(c + 32) : c; }
static char huruf_besar(char c) { return (c >= 'a' && c <= 'z') ? (char)(c - 32) : c; }
static bool adalah_spasi(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

/* s diawali 'awalan' (tidak peka huruf besar/kecil)? */
static bool awalan_ci(const char* s, const char* awalan) {
  while (*awalan) {
    if (huruf_kecil(*s) != huruf_kecil(*awalan)) return false;
    s++; awalan++;
  }
  return true;
}
/* s sama persis dengan t (tidak peka huruf besar/kecil)? */
static bool sama_ci(const char* s, const char* t) {
  return awalan_ci(s, t) && s[strlen(t)] == '\0';
}

/* ---------------- Modbus RTU ---------------- */
uint16_t agro_crc16(const uint8_t* b, uint16_t n) {
  uint16_t c = 0xFFFF;
  for (uint16_t i = 0; i < n; i++) {
    c ^= b[i];
    for (uint8_t j = 0; j < 8; j++) c = (c & 1) ? (uint16_t)((c >> 1) ^ 0xA001) : (uint16_t)(c >> 1);
  }
  return c;
}

void agro_modbus_buat_baca(uint8_t sid, uint16_t start, uint16_t count, uint8_t out[8]) {
  out[0] = sid;
  out[1] = 0x03;
  out[2] = (uint8_t)(start >> 8);
  out[3] = (uint8_t)(start & 0xFF);
  out[4] = (uint8_t)(count >> 8);
  out[5] = (uint8_t)(count & 0xFF);
  uint16_t c = agro_crc16(out, 6);
  out[6] = (uint8_t)(c & 0xFF);
  out[7] = (uint8_t)(c >> 8);
}

bool agro_modbus_urai_balasan(const uint8_t* r, uint16_t n, uint8_t sid,
                              uint16_t count, uint16_t* out) {
  if (n < 5) return false;

  /* cari awal frame: [sid][0x03] (lewati byte sampah di depan) */
  uint16_t s = 0;
  while ((uint32_t)s + 4 < n) {
    if (r[s] == sid && r[s + 1] == 0x03) break;
    s++;
  }
  if ((uint32_t)s + 5 > n) return false;
  r += s;
  n = (uint16_t)(n - s);

  uint16_t rx = (uint16_t)(r[n - 2] | ((uint16_t)r[n - 1] << 8));
  if (rx != agro_crc16(r, (uint16_t)(n - 2))) return false;
  if (r[2] != (uint8_t)(count * 2)) return false;
  if (n < (uint16_t)(5 + count * 2)) return false;

  for (uint16_t i = 0; i < count; i++)
    out[i] = (uint16_t)(((uint16_t)r[3 + 2 * i] << 8) | r[4 + 2 * i]);
  return true;
}

float agro_skala_ph(uint16_t raw)     { return raw / 100.0f; }
float agro_skala_suhu(uint16_t raw)   { return raw / 10.0f; }
float agro_skala_lembab(uint16_t raw) { return raw / 10.0f; }
float agro_tds_dari_ec(float ec)      { return isnan(ec) ? NAN : ec * 0.5f; }

bool agro_semua_nan(const float* v, size_t n) {
  for (size_t i = 0; i < n; i++) if (!isnan(v[i])) return false;
  return true;
}

/* ---------------- Pompa / relay ---------------- */
int agro_relay_level(bool nyala, bool active_low) {
  return active_low ? (nyala ? 0 : 1) : (nyala ? 1 : 0);
}

agro_pin_aksi_t agro_relay_aksi(bool nyala, uint8_t mode) {
  switch (mode) {
    case 2:  return nyala ? AGRO_PIN_HIGH : AGRO_PIN_LOW;     /* aktif-HIGH */
    case 1:  return nyala ? AGRO_PIN_LOW  : AGRO_PIN_LEPAS;   /* aktif-LOW open-drain */
    default: return nyala ? AGRO_PIN_LOW  : AGRO_PIN_HIGH;    /* aktif-LOW biasa */
  }
}

bool agro_pompa_timeout(bool sedang_on, uint32_t mulai_ms, uint32_t sekarang_ms, uint32_t maks_ms) {
  return sedang_on && (uint32_t)(sekarang_ms - mulai_ms) >= maks_ms;
}

/* ---------------- Perintah MQTT ---------------- */
agro_cmd_hasil_t agro_parse_perintah(const char* topik, const char* topik_semua,
                                     const char* prefix_ch, uint8_t jumlah,
                                     const uint8_t* payload, unsigned int len,
                                     int* target, bool* nyala) {
  const size_t lp = strlen(prefix_ch);

  if (strcmp(topik, topik_semua) == 0) {
    *target = -1;
  } else if (strncmp(topik, prefix_ch, lp) == 0 &&
             topik[lp] >= '1' && topik[lp] < (char)('1' + jumlah) &&
             topik[lp + 1] == '\0') {
    *target = topik[lp] - '1';
  } else {
    return AGRO_CMD_ABAIKAN;
  }

  /* trim kiri-kanan, lalu ubah ke huruf besar */
  unsigned int a = 0, b = len;
  while (a < b && adalah_spasi((char)payload[a])) a++;
  while (b > a && adalah_spasi((char)payload[b - 1])) b--;

  char buf[16];
  if (b - a >= sizeof(buf)) return AGRO_CMD_TIDAK_DIKENAL;
  size_t n = 0;
  for (unsigned int i = a; i < b; i++) buf[n++] = huruf_besar((char)payload[i]);
  buf[n] = '\0';

  if (strcmp(buf, "ON") == 0)  { *nyala = true;  return AGRO_CMD_VALID; }
  if (strcmp(buf, "OFF") == 0) { *nyala = false; return AGRO_CMD_VALID; }
  return AGRO_CMD_TIDAK_DIKENAL;
}

/* ---------------- HTTP / Google Sheets ---------------- */
int agro_url_pisah(const char* url, char* host, size_t host_len, char* path, size_t path_len) {
  const char* p = strstr(url, "://");
  if (!p) return -10;
  const char* sisa = p + 3;
  const char* s = strchr(sisa, '/');
  if (!s) return -11;

  size_t hn = (size_t)(s - sisa);
  size_t pn = strlen(s);
  if (hn == 0 || hn >= host_len || pn >= path_len) return -12;

  memcpy(host, sisa, hn);
  host[hn] = '\0';
  memcpy(path, s, pn + 1);
  return 0;
}

int agro_http_status(const char* resp) {
  if (!resp || strlen(resp) < 12) return -2;
  if (resp[9] < '0' || resp[9] > '9' || resp[10] < '0' || resp[10] > '9' ||
      resp[11] < '0' || resp[11] > '9') return -2;
  return (resp[9] - '0') * 100 + (resp[10] - '0') * 10 + (resp[11] - '0');
}

bool agro_http_redirect(int kode) {
  return kode == 301 || kode == 302 || kode == 303 || kode == 307 || kode == 308;
}

bool agro_http_header(const char* resp, const char* nama, char* out, size_t out_len) {
  if (out_len) out[0] = '\0';
  const size_t ln = strlen(nama);
  const char* p = resp;
  bool baris_pertama = true;

  while (*p) {
    if (!baris_pertama && (*p == '\r' || *p == '\n')) break;  /* akhir header */
    const char* e = strchr(p, '\n');

    if (!baris_pertama && awalan_ci(p, nama) && p[ln] == ':') {
      const char* v = p + ln + 1;
      while (*v == ' ' || *v == '\t') v++;
      size_t len = e ? (size_t)(e - v) : strlen(v);
      while (len > 0 && adalah_spasi(v[len - 1])) len--;
      if (len >= out_len) return false;
      memcpy(out, v, len);
      out[len] = '\0';
      return true;
    }
    baris_pertama = false;
    if (!e) break;
    p = e + 1;
  }
  return false;
}

const char* agro_http_body(const char* resp) {
  const char* b = strstr(resp, "\r\n\r\n");
  return b ? b + 4 : resp;
}

bool agro_url_encode(const char* in, char* out, size_t out_len) {
  static const char hex[] = "0123456789ABCDEF";
  size_t o = 0;
  for (; *in; in++) {
    unsigned char c = (unsigned char)*in;
    bool aman = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~';
    if (aman) {
      if (o + 1 >= out_len) return false;
      out[o++] = (char)c;
    } else {
      if (o + 3 >= out_len) return false;
      out[o++] = '%';
      out[o++] = hex[c >> 4];
      out[o++] = hex[c & 0x0F];
    }
  }
  if (o >= out_len) return false;
  out[o] = '\0';
  return true;
}

/* tulis "<kunci>=<angka>" pada posisi pos; mengembalikan posisi baru atau -1 */
static int tulis_param(char* buf, size_t len, int pos, const char* kunci, float v, int desimal) {
  if (pos < 0 || (size_t)pos >= len) return -1;
  int n;
  if (isnan(v)) n = snprintf(buf + pos, len - (size_t)pos, "%s=", kunci);
  else          n = snprintf(buf + pos, len - (size_t)pos, "%s=%.*f", kunci, desimal, (double)v);
  if (n < 0 || (size_t)n >= len - (size_t)pos) return -1;
  return pos + n;
}

int agro_buat_url_sheets(char* out, size_t out_len, const char* base,
                         float ph, float suhu, float ec, float lembab,
                         float n, float p, float k, const char* dev) {
  int pos = snprintf(out, out_len, "%s", base);
  if (pos < 0 || (size_t)pos >= out_len) return -1;

  pos = tulis_param(out, out_len, pos, "?ph",    ph,     2);
  pos = tulis_param(out, out_len, pos, "&temp",  suhu,   1);
  pos = tulis_param(out, out_len, pos, "&ec",    ec,     0);
  pos = tulis_param(out, out_len, pos, "&moist", lembab, 1);
  pos = tulis_param(out, out_len, pos, "&N",     n,      0);
  pos = tulis_param(out, out_len, pos, "&P",     p,      0);
  pos = tulis_param(out, out_len, pos, "&K",     k,      0);
  if (pos < 0) return -1;

  char dev_enc[64];
  if (!agro_url_encode(dev, dev_enc, sizeof(dev_enc))) return -1;
  int w = snprintf(out + pos, out_len - (size_t)pos, "&dev=%s", dev_enc);
  if (w < 0 || (size_t)w >= out_len - (size_t)pos) return -1;
  return pos + w;
}

/* ---------------- Tampilan ---------------- */
void agro_fmt_nilai(char* buf, size_t len, float v, int desimal, const char* satuan) {
  if (isnan(v)) snprintf(buf, len, "--");
  else          snprintf(buf, len, "%.*f%s", desimal, (double)v, satuan ? satuan : "");
}

/* ---------------- WiFi: validasi & perintah Serial ---------------- */
bool agro_ssid_valid(const char* ssid) {
  if (!ssid) return false;
  size_t n = strlen(ssid);
  return n >= 1 && n <= 32;
}

bool agro_pass_valid(const char* pass) {
  if (!pass) return false;
  size_t n = strlen(pass);
  return n == 0 || (n >= 8 && n <= 63);
}

agro_ser_t agro_parse_serial(char* line, const char** nilai) {
  *nilai = "";

  size_t n = strlen(line);
  while (n > 0 && (line[n - 1] == '\r' || line[n - 1] == '\n')) line[--n] = '\0';
  while (*line == ' ' || *line == '\t') line++;
  if (*line == '\0') return AGRO_SER_KOSONG;

  /* perintah dengan nilai: spasi di nilai dipertahankan (SSID/password boleh berspasi) */
  if (awalan_ci(line, "SSID=")) { *nilai = line + 5; return AGRO_SER_SSID; }
  if (awalan_ci(line, "PASS=")) { *nilai = line + 5; return AGRO_SER_PASS; }
  if (awalan_ci(line, "RELAY=")) { *nilai = line + 6; return AGRO_SER_RELAY; }

  size_t m = strlen(line);
  while (m > 0 && adalah_spasi(line[m - 1])) line[--m] = '\0';

  if (sama_ci(line, "WIFIRESET")) return AGRO_SER_HAPUS;
  if (sama_ci(line, "PORTAL"))    return AGRO_SER_PORTAL;
  if (sama_ci(line, "STATUS"))    return AGRO_SER_STATUS;
  if (sama_ci(line, "TESRELAY"))  return AGRO_SER_TES_RELAY;
  if (sama_ci(line, "HELP") || sama_ci(line, "?")) return AGRO_SER_BANTUAN;
  return AGRO_SER_TIDAK_DIKENAL;
}
