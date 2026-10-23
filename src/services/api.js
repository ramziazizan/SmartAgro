const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1ugaAUT_MaKnitaYRFISs00G9U9pWHukL_4VHxKr7OmQ/export?format=csv'
const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=3.5952&longitude=98.6722&current=weather_code&hourly=weather_code,precipitation_probability&forecast_days=1&timezone=Asia%2FBangkok'
const DEFAULT_ESP32_IP = '192.168.1.105'
const RAIN_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

function getESP32BaseUrl(ipAddress = DEFAULT_ESP32_IP) {
  const ip = ipAddress.trim()
  const octets = ip.split('.')

  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    throw new Error('Masukkan alamat IPv4 yang valid, contoh: 192.168.1.105')
  }

  return `http://${ip}`
}

async function fetchWithTimeout(url, options, timeoutMs, parseResponse) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return await parseResponse(response)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Permintaan ke ESP32 timeout setelah ${timeoutMs / 1000} detik`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseCsv(csvText) {
  const rows = []
  let row = []
  let field = ''
  let isQuoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]

    if (character === '"') {
      if (isQuoted && csvText[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        isQuoted = !isQuoted
      }
    } else if (character === ',' && !isQuoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !isQuoted) {
      if (character === '\r' && csvText[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

function parseNumber(value) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null

  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export async function fetchSensorFromCSV() {
  const response = await fetch(SHEET_CSV_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Spreadsheet mengembalikan HTTP ${response.status}`)
  }

  const csvText = (await response.text()).replace(/^\uFEFF/, '')
  const rows = parseCsv(csvText)
  const dataRows = rows.slice(1)
  const latestRow = dataRows[dataRows.length - 1]

  if (!latestRow || latestRow.length < 9) {
    throw new Error('Baris data spreadsheet tidak memiliki 9 kolom yang diperlukan')
  }

  return {
    timestamp: latestRow[0].trim(),
    ph: parseNumber(latestRow[1]),
    temperature: parseNumber(latestRow[2]),
    ec: parseNumber(latestRow[3]),
    moisture: parseNumber(latestRow[4]),
    nitrogen: parseNumber(latestRow[5]),
    phosphorus: parseNumber(latestRow[6]),
    potassium: parseNumber(latestRow[7]),
    deviceId: latestRow[8].trim(),
  }
}

export async function fetchWeather() {
  const response = await fetch(OPEN_METEO_URL)
  if (!response.ok) {
    throw new Error(`Open-Meteo mengembalikan HTTP ${response.status}`)
  }

  const data = await response.json()
  const forecastTimes = data.hourly?.time
  const weatherCodes = data.hourly?.weather_code
  const precipitationProbabilities = data.hourly?.precipitation_probability

  if (!Array.isArray(forecastTimes) || !Array.isArray(weatherCodes)) {
    throw new Error('Respons Open-Meteo tidak memiliki data prakiraan per jam')
  }

  const forecastIndex = forecastTimes.findIndex(
    (forecastTime) => forecastTime > data.current?.time,
  )
  const index = forecastIndex >= 0 ? forecastIndex : forecastTimes.length - 1
  const weatherCode = weatherCodes[index]
  if (index < 0 || typeof weatherCode !== 'number') {
    throw new Error('Respons Open-Meteo tidak memiliki kode cuaca prakiraan yang valid')
  }
  const precipitationProbability = precipitationProbabilities?.[index] ?? null
  const isRainy =
    RAIN_WEATHER_CODES.has(weatherCode) ||
    (typeof precipitationProbability === 'number' && precipitationProbability >= 50)

  return {
    condition: isRainy ? 'Hujan' : 'Cerah',
    forecastTime: forecastTimes[index],
    precipitationProbability,
  }
}

export async function fetchESP32Status(ipAddress) {
  return fetchWithTimeout(
    `${getESP32BaseUrl(ipAddress)}/status`,
    { method: 'GET', cache: 'no-store' },
    3000,
    async (response) => {
      if (!response.ok) {
        throw new Error(`ESP32 mengembalikan HTTP ${response.status}`)
      }

      const status = await response.json()
      if (typeof status.pumpOn !== 'boolean') {
        throw new Error('Respons status ESP32 tidak memiliki pumpOn boolean')
      }

      return status
    },
  )
}

export async function sendESP32PumpCommand(command, ipAddress) {
  if (command !== 'ON' && command !== 'OFF') {
    throw new Error('Perintah pompa harus ON atau OFF')
  }

  return fetchWithTimeout(
    `${getESP32BaseUrl(ipAddress)}/pump`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: command,
    },
    4000,
    async (response) => {
      if (!response.ok) {
        throw new Error(`ESP32 menolak perintah (HTTP ${response.status})`)
      }

      return response.text()
    },
  )
}
