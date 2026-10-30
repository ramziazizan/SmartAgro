// ============================================================
// DATA DUMMY CUACA — untuk Backtest Logika Otomasi Pompa
// ============================================================
// Setiap skenario mensimulasikan kondisi cuaca berbeda
// yang dikombinasikan dengan berbagai level kelembapan tanah.

export const WEATHER_SCENARIOS = [
  {
    id: 'sunny_clear',
    label: 'Cerah Terik',
    condition: 'Cerah',
    precipitationProbability: 0,
    description: 'Langit cerah tanpa awan, tidak ada potensi hujan.',
    icon: '☀️',
  },
  {
    id: 'partly_cloudy',
    label: 'Berawan Sebagian',
    condition: 'Cerah',
    precipitationProbability: 20,
    description: 'Berawan sebagian, peluang hujan sangat kecil.',
    icon: '⛅',
  },
  {
    id: 'overcast',
    label: 'Mendung',
    condition: 'Cerah',
    precipitationProbability: 40,
    description: 'Langit mendung, ada kemungkinan gerimis ringan.',
    icon: '🌥️',
  },
  {
    id: 'light_rain_incoming',
    label: 'Akan Hujan Ringan',
    condition: 'Hujan',
    precipitationProbability: 55,
    description: 'Diprediksi hujan ringan dalam waktu dekat.',
    icon: '🌦️',
  },
  {
    id: 'moderate_rain',
    label: 'Hujan Sedang',
    condition: 'Hujan',
    precipitationProbability: 75,
    description: 'Hujan sedang, curah hujan cukup signifikan.',
    icon: '🌧️',
  },
  {
    id: 'heavy_rain',
    label: 'Hujan Lebat',
    condition: 'Hujan',
    precipitationProbability: 95,
    description: 'Hujan lebat, potensi genangan tinggi.',
    icon: '⛈️',
  },
]

// Level kelembapan tanah yang diuji — mencakup semua ambang batas kritis
export const MOISTURE_TEST_CASES = [
  { moisture: 5,  label: 'Sangat Kritis (5%)',   zone: 'critical' },
  { moisture: 10, label: 'Kritis (10%)',          zone: 'critical' },
  { moisture: 19, label: 'Tepat Bawah Kritis (19%)', zone: 'critical' },
  { moisture: 20, label: 'Batas Kritis (20%)',    zone: 'dry' },
  { moisture: 25, label: 'Kering (25%)',          zone: 'dry' },
  { moisture: 35, label: 'Kering (35%)',          zone: 'dry' },
  { moisture: 39, label: 'Tepat Bawah Normal (39%)', zone: 'dry' },
  { moisture: 40, label: 'Batas Optimal (40%)',   zone: 'optimal' },
  { moisture: 50, label: 'Optimal (50%)',         zone: 'optimal' },
  { moisture: 60, label: 'Optimal (60%)',         zone: 'optimal' },
  { moisture: 65, label: 'Batas Jenuh (65%)',     zone: 'optimal' },
  { moisture: 70, label: 'Jenuh (70%)',           zone: 'saturated' },
  { moisture: 85, label: 'Sangat Jenuh (85%)',    zone: 'saturated' },
  { moisture: 100, label: 'Penuh (100%)',         zone: 'saturated' },
]

// Warna zona kelembapan
export const ZONE_STYLES = {
  critical:  { bg: 'bg-rose-500/10',   border: 'border-rose-500/30',   text: 'text-rose-300',   label: 'Kritis' },
  dry:       { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-300',  label: 'Kering' },
  optimal:   { bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-300',label: 'Optimal' },
  saturated: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-300', label: 'Jenuh' },
}

