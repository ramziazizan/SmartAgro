// Logika Pengambilan Keputusan Otomasi Pompa Berbasis Multi-Ambang Kelembapan Tanah & Prakiraan Cuaca

export const MOISTURE_THRESHOLDS = {
  CRITICAL: 20, // < 20%: Sangat Kering (kritis mendekati titik layu)
  LOW: 40,      // 20% - 39.9%: Kering (perlu penyiraman reguler)
  HIGH: 65,     // 40% - 65%: Optimal (kelembapan ideal perakaran)
                // > 65%: Jenuh (tanah terlalu basah / risiko busuk akar)
}

export function getPumpAutomationDecision({
  moisture,
  weather,
  precipitationProbability = null,
}) {
  if (typeof moisture !== 'number' || Number.isNaN(moisture)) {
    return {
      action: null,
      statusType: 'waiting',
      category: 'unknown',
      categoryLabel: 'Menunggu Sensor',
      reason: 'Menunggu pembacaan data kelembapan tanah dari sensor.',
      badgeStyle: 'border-slate-700 bg-slate-800 text-slate-300',
    }
  }

  const isRainy = weather === 'Hujan'
  const precipText =
    typeof precipitationProbability === 'number'
      ? ` (probabilitas presipitasi ${precipitationProbability}%)`
      : ''
  const moistFormatted = `${moisture.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`

  // 1. Kondisi Sangat Kering / Kritis (< 20%)
  if (moisture < MOISTURE_THRESHOLDS.CRITICAL) {
    if (isRainy) {
      return {
        action: 'Pompa Hidup [Siram Singkat / Darurat]',
        statusType: 'pump_on',
        category: 'critical',
        categoryLabel: 'Sangat Kering (< 20%)',
        reason: `Kelembapan tanah berada di level kritis (${moistFormatted} < 20%). Meskipun diprediksi hujan${precipText}, tanaman berisiko mengalami stres layu bila menunggu. Direkomendasikan penyiraman darurat secukupnya untuk menjaga kelembapan perakaran.`,
        badgeStyle: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-sm',
      }
    }
    return {
      action: 'Pompa Hidup [Penyiraman Intensif]',
      statusType: 'pump_on',
      category: 'critical',
      categoryLabel: 'Sangat Kering (< 20%)',
      reason: `Kelembapan tanah sangat rendah (${moistFormatted} < 20%) dan cuaca cerah tanpa hujan. Pompa harus segera dihidupkan untuk irigasi penuh guna mencegah kekeringan parah pada tanaman.`,
      badgeStyle: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-sm',
    }
  }

  // 2. Kondisi Kering / Kurang Air (20% - 39.9%)
  if (moisture < MOISTURE_THRESHOLDS.LOW) {
    if (isRainy) {
      return {
        action: 'Pompa Mati [Menunggu Hujan]',
        statusType: 'pump_off',
        category: 'dry',
        categoryLabel: 'Kering (20% - 39%)',
        reason: `Kelembapan tanah rendah (${moistFormatted}), tetapi prakiraan cuaca menunjukkan hujan${precipText}. Pompa dinonaktifkan untuk efisiensi air dengan memanfaatkan curah hujan alami yang akan tiba.`,
        badgeStyle: 'border-amber-500/40 bg-amber-500/20 text-amber-300 shadow-sm',
      }
    }
    return {
      action: 'Pompa Hidup [Penyiraman Normal]',
      statusType: 'pump_on',
      category: 'dry',
      categoryLabel: 'Kering (20% - 39%)',
      reason: `Kelembapan tanah (${moistFormatted}) berada di bawah ambang batas ideal (40%) dan cuaca cerah. Pompa direkomendasikan aktif untuk mengembalikan kelembapan tanah ke rentang normal.`,
      badgeStyle: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-sm',
    }
  }

  // 3. Kondisi Optimal (40% - 65%)
  if (moisture <= MOISTURE_THRESHOLDS.HIGH) {
    return {
      action: 'Pompa Mati [Kondisi Optimal]',
      statusType: 'pump_off',
      category: 'optimal',
      categoryLabel: 'Optimal (40% - 65%)',
      reason: `Kelembapan tanah (${moistFormatted}) berada dalam rentang ideal perakaran (40% - 65%). Pasokan air mencukupi, sehingga pompa dimatikan untuk mencegah pemborosan air dan menjaga aerasi tanah.`,
      badgeStyle: 'border-sky-500/40 bg-sky-500/20 text-sky-300 shadow-sm',
    }
  }

  // 4. Kondisi Jenuh / Sangat Basah (> 65%)
  if (isRainy) {
    return {
      action: 'Pompa Mati [Waspada Genangan]',
      statusType: 'pump_off',
      category: 'saturated',
      categoryLabel: 'Jenuh (> 65%)',
      reason: `Kelembapan tanah sangat tinggi (${moistFormatted} > 65%) dan cuaca diprediksi hujan${precipText}. Pompa wajib mati; disarankan memeriksa saluran drainase agar lahan tidak tergenang.`,
      badgeStyle: 'border-rose-500/40 bg-rose-500/20 text-rose-300 shadow-sm',
    }
  }

  return {
    action: 'Pompa Mati [Tanah Terlalu Basah]',
    statusType: 'pump_off',
    category: 'saturated',
    categoryLabel: 'Jenuh (> 65%)',
    reason: `Kelembapan tanah sangat tinggi (${moistFormatted} > 65%). Pompa dimatikan agar kelembapan tanah dapat mengering secara alami menuju batas optimal.`,
    badgeStyle: 'border-rose-500/40 bg-rose-500/20 text-rose-300 shadow-sm',
  }
}

