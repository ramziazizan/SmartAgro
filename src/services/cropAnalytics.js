// Parameter sensor dan rentang ideal tanah

export const SENSOR_PARAMS = {
  kelembapan: {
    key: 'kelembapan',
    aliases: ['moisture', 'moist', 'kelembapan'],
    label: 'Moist',
    unit: '%',
    min: 0,
    max: 100,
    idealMin: 30,
    idealMax: 60,
    color: '#38bdf8', // sky-400
    colorFill: 'rgba(56, 189, 248, 0.15)',
  },
  suhu: {
    key: 'suhu',
    aliases: ['temperature', 'temp', 'suhu'],
    label: 'Temp',
    unit: '°C',
    min: 0,
    max: 50,
    idealMin: 20,
    idealMax: 32,
    color: '#fbbf24', // amber-400
    colorFill: 'rgba(251, 191, 36, 0.15)',
  },
  ph: {
    key: 'ph',
    aliases: ['ph'],
    label: 'pH',
    unit: 'pH',
    min: 0,
    max: 14,
    idealMin: 6.5,
    idealMax: 7.5,
    color: '#34d399', // emerald-400
    colorFill: 'rgba(52, 211, 153, 0.15)',
  },
  ec: {
    key: 'ec',
    aliases: ['ec'],
    label: 'EC',
    unit: 'µS/cm',
    min: 0,
    max: 2000,
    idealMin: 200,
    idealMax: 1200,
    color: '#a78bfa', // violet-400
    colorFill: 'rgba(167, 139, 250, 0.15)',
  },
  n: {
    key: 'n',
    aliases: ['nitrogen', 'n'],
    label: 'N',
    unit: 'mg/kg',
    min: 0,
    max: 250,
    idealMin: 40,
    idealMax: 160,
    color: '#4ade80', // green-400
    colorFill: 'rgba(74, 222, 128, 0.15)',
  },
  p: {
    key: 'p',
    aliases: ['phosphorus', 'p'],
    label: 'Fosfor',
    unit: 'mg/kg',
    min: 0,
    max: 250,
    idealMin: 40,
    idealMax: 160,
    color: '#a3e635', // lime-400
    colorFill: 'rgba(163, 230, 53, 0.15)',
  },
  k: {
    key: 'k',
    aliases: ['potassium', 'k'],
    label: 'K',
    unit: 'mg/kg',
    min: 0,
    max: 250,
    idealMin: 40,
    idealMax: 160,
    color: '#2dd4bf', // teal-400
    colorFill: 'rgba(45, 212, 191, 0.15)',
  },
}

export function extractParamValue(reading, paramKey) {
  if (!reading) return null
  const param = SENSOR_PARAMS[paramKey]
  if (!param) return null

  for (const alias of param.aliases) {
    if (reading[alias] !== undefined && reading[alias] !== null && reading[alias] !== '') {
      const num = Number(reading[alias])
      if (Number.isFinite(num)) return num
    }
  }
  return null
}
