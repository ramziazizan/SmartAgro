import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudRain, Power, Sun, Wifi, WifiOff, Zap } from 'lucide-react'
import { fetchESP32Status, sendESP32PumpCommand } from '../services/api.js'

const ACTION_STYLES = {
  'Pompa Hidup': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'Pompa Mati [Prakiraan Hujan]': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'Pompa Mati': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}
const STATUS_POLL_INTERVAL = 4000
const DEFAULT_ESP32_IP = '192.xxx.x.xxx'
const ESP32_IP_STORAGE_KEY = 'smart-agro-esp32-ip'

function getSavedEsp32Ip() {
  try {
    return window.localStorage.getItem(ESP32_IP_STORAGE_KEY) || DEFAULT_ESP32_IP
  } catch {
    return DEFAULT_ESP32_IP
  }
}

function isValidIpv4(value) {
  const octets = value.trim().split('.')
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  )
}

export default function AutomationBanner({ action, forecastTime, moisture, weather }) {
  const [esp32Ip, setEsp32Ip] = useState(getSavedEsp32Ip)
  const [ipInput, setIpInput] = useState(getSavedEsp32Ip)
  const [ipError, setIpError] = useState('')
  const [pumpOn, setPumpOn] = useState(null)
  const [isOnline, setIsOnline] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('Memeriksa koneksi ESP32...')
  const isBusyRef = useRef(false)
  const statusRequestInProgress = useRef(false)
  const WeatherIcon = weather === 'Hujan' ? CloudRain : Sun
  const forecastLabel = forecastTime ? forecastTime.slice(11, 16) : null
  const actionStyle =
    ACTION_STYLES[action] || 'border-slate-700 bg-slate-800 text-slate-300'

  const checkStatus = useCallback(async () => {
    if (statusRequestInProgress.current) return

    statusRequestInProgress.current = true
    try {
      const status = await fetchESP32Status(esp32Ip)
      setPumpOn(status.pumpOn)
      setIsOnline(true)
      setConnectionMessage('ESP32 Terhubung')
    } catch (error) {
      setPumpOn(null)
      setIsOnline(false)
      setConnectionMessage('ESP32 Offline.')
      console.error('Gagal membaca status ESP32:', error)
    } finally {
      statusRequestInProgress.current = false
    }
  }, [esp32Ip])

  useEffect(() => {
    const initialCheckId = window.setTimeout(checkStatus, 0)
    const intervalId = window.setInterval(() => {
      if (!isBusyRef.current) checkStatus()
    }, STATUS_POLL_INTERVAL)

    return () => {
      window.clearTimeout(initialCheckId)
      window.clearInterval(intervalId)
    }
  }, [checkStatus])

  const handleConnect = (event) => {
    event.preventDefault()
    const normalizedIp = ipInput.trim()
    if (!isValidIpv4(normalizedIp)) {
      setIpError('Masukkan alamat IPv4 yang valid, contoh: 192.168.1.105')
      return
    }

    try {
      window.localStorage.setItem(ESP32_IP_STORAGE_KEY, normalizedIp)
    } catch (error) {
      console.error('Alamat IP ESP32 tidak dapat disimpan di browser:', error)
    }

    setIpError('')
    setIpInput(normalizedIp)
    setEsp32Ip(normalizedIp)
    setPumpOn(null)
    setIsOnline(false)
    setConnectionMessage('Menghubungkan ke ESP32...')
  }

  const handlePumpCommand = async (command) => {
    if (isBusyRef.current) return
    if (
      command === 'ON' &&
      !window.confirm('Yakin ingin menghidupkan pompa secara manual?')
    ) {
      return
    }

    isBusyRef.current = true
    setIsBusy(true)
    setConnectionMessage('Mengirim perintah...')

    try {
      await sendESP32PumpCommand(command, esp32Ip)
      setPumpOn(command === 'ON')
      setIsOnline(true)
      setConnectionMessage(`ESP32 Terhubung · Perintah ${command} terkirim`)
      await checkStatus()
    } catch (error) {
      setIsOnline(false)
      setConnectionMessage('ESP32 Offline.')
      console.error(`Gagal mengirim perintah ${command} ke ESP32:`, error)
    } finally {
      isBusyRef.current = false
      setIsBusy(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/40 p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
            <Zap aria-hidden="true" className="h-3.5 w-3.5" />
            OTOMATISASI SISTEM
          </div>
          <h2 className="text-xl font-semibold text-white"> </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Keputusan dihitung dari kelembapan tanah (&lt; 40%) dan prakiraan cuaca satu jam berikutnya.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="mb-2 block text-xs text-slate-500">Kelembapan Tanah (Moist)</span>
              <strong className="flex items-center gap-2 text-2xl text-white">
                <Zap aria-hidden="true" className="h-5 w-5 text-sky-400" />
                {typeof moisture === 'number' ? `${moisture}%` : '—'}
              </strong>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="mb-2 block text-xs text-slate-500">Prediksi Cuaca</span>
              <strong className="flex items-center gap-2 text-lg text-white">
                {weather && (
                  <WeatherIcon
                    aria-hidden="true"
                    className={`h-5 w-5 ${weather === 'Hujan' ? 'text-sky-400' : 'text-amber-400'}`}
                  />
                )}
                {weather || 'Menunggu data'}
              </strong>
              {forecastLabel && (
                <span className="mt-1 block text-xs text-slate-500">Sekitar pukul: {forecastLabel}</span>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-800 pt-4">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Status pompa saat ini:
            </span>
            <span
              className={`inline-flex rounded-lg border px-3 py-2 text-sm font-bold ${actionStyle}`}
              role="status"
            >
              {action || 'MENUNGGU DATA SENSOR / CUACA'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Control Module</h3>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                isOnline
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
              aria-live="polite"
            >
              {isOnline ? (
                <Wifi aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <form className="mt-4" onSubmit={handleConnect}>
            <label className="mb-2 block text-xs font-medium text-slate-400" htmlFor="esp32-ip">
              Alamat IP Module ESP
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                id="esp32-ip"
                inputMode="decimal"
                onChange={(event) => {
                  setIpInput(event.target.value)
                  setIpError('')
                }}
                placeholder="192.168.1.105"
                spellCheck="false"
                type="text"
                value={ipInput}
              />
              <button
                className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20"
                type="submit"
              >
                Simpan &amp; Hubungkan
              </button>
            </div>
            {ipError && (
              <p className="mt-2 text-xs text-rose-300" role="alert">
                {ipError}
              </p>
            )}
          </form>

          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-center text-lg font-bold ${
              pumpOn === true
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : pumpOn === false
                  ? 'border-slate-700 bg-slate-900 text-slate-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
            aria-live="polite"
          >
            {pumpOn === null ? 'STATUS POMPA TIDAK TERSEDIA' : pumpOn ? 'POMPA ON' : 'POMPA OFF'}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBusy || !isOnline}
              onClick={() => handlePumpCommand('ON')}
              type="button"
            >
              <Power aria-hidden="true" className="h-4 w-4" />
              Hidupkan
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBusy || !isOnline}
              onClick={() => handlePumpCommand('OFF')}
              type="button"
            >
              <Power aria-hidden="true" className="h-4 w-4" />
              Matikan
            </button>
          </div>

          <p className="mt-3 min-h-5 text-xs text-slate-400" role="status" aria-live="polite">
            {isBusy ? 'Mengirim perintah...' : connectionMessage}
          </p>
        </div>
      </div>
    </section>
  )
}
