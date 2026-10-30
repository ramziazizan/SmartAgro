import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut, LineChart, Wifi, WifiOff } from 'lucide-react'
import {
  getMqttApiHealth,
  getMqttDeviceSnapshot,
  logInToMqttApi,
} from '../services/mqttApi.js'
import SensorChart from './SensorChart.jsx'

const STATUS_POLL_INTERVAL = 15_000
const HEALTH_POLL_INTERVAL = 60_000

export default function MqttControlPanel({ onPumpStatusUpdate, onTelemetryUpdate, sensorData }) {
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [brokerOnline, setBrokerOnline] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('Silahkan login untuk membuka tren grafik.')

  const checkHealth = useCallback(async () => {
    try {
      const health = await getMqttApiHealth()
      setBrokerOnline(Boolean(health.mqtt?.connected))
      if (!health.mqtt?.configured) {
        setMessage('Broker belum dikonfigurasi pada backend.')
      } else if (!health.mqtt.connected) {
        setMessage('Backend aktif, menunggu koneksi broker.')
      }
    } catch (error) {
      setBrokerOnline(false)
      setMessage(error.message)
    }
  }, [])

  const checkDevice = useCallback(async () => {
    if (!token) return

    try {
      const snapshot = await getMqttDeviceSnapshot(token)
      const nextPumpStatus = {
        online: Boolean(snapshot.online),
        pumpOn: typeof snapshot.pumpOn === 'boolean' ? snapshot.pumpOn : null,
      }
      setDeviceOnline(nextPumpStatus.online)
      if (onPumpStatusUpdate) onPumpStatusUpdate(nextPumpStatus)
      if (snapshot.online) setMessage('Data sensor dan perangkat terverifikasi online.')
      else setMessage('Menunggu sinkronisasi perangkat.')
      if (onTelemetryUpdate) onTelemetryUpdate(snapshot.telemetry)
    } catch (error) {
      if (onPumpStatusUpdate) onPumpStatusUpdate(null)
      if (onTelemetryUpdate) onTelemetryUpdate(null)
      if (error.status === 401) {
        setToken('')
        setDeviceOnline(false)
        setMessage('Sesi login berakhir. Silahkan login kembali.')
      } else {
        setDeviceOnline(false)
        setMessage(error.message)
      }
    }
  }, [onPumpStatusUpdate, onTelemetryUpdate, token])

  useEffect(() => {
    const initialCheckId = window.setTimeout(checkHealth, 0)
    const intervalId = window.setInterval(checkHealth, HEALTH_POLL_INTERVAL)
    return () => {
      window.clearTimeout(initialCheckId)
      window.clearInterval(intervalId)
    }
  }, [checkHealth])

  useEffect(() => {
    if (!token) return undefined

    const initialCheckId = window.setTimeout(checkDevice, 0)
    const intervalId = window.setInterval(checkDevice, STATUS_POLL_INTERVAL)
    return () => {
      window.clearTimeout(initialCheckId)
      window.clearInterval(intervalId)
    }
  }, [checkDevice, token])

  const handleLogin = async (event) => {
    event.preventDefault()
    setIsBusy(true)
    setLoginError('')
    try {
      const result = await logInToMqttApi(username.trim(), password)
      setToken(result.token)
      setPassword('')
      setMessage('Login berhasil. Panel grafik sensor terbuka.')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setDeviceOnline(false)
    if (onPumpStatusUpdate) onPumpStatusUpdate(null)
    if (onTelemetryUpdate) onTelemetryUpdate(null)
    setMessage('Silakan login untuk membuka grafik sensor.')
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
      {/* Header Panel */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-violet-400" />
            <h3 className="font-semibold text-white">
              {token ? 'Grafik Riwayat Sensor' : 'Akses Grafik Sensor'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                deviceOnline
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-800/80 text-slate-400'
              }`}
              aria-live="polite"
            >
              {deviceOnline ? (
                <Wifi aria-hidden="true" className="h-3 w-3 text-emerald-400" />
              ) : (
                <WifiOff aria-hidden="true" className="h-3 w-3 text-slate-400" />
              )}
              {deviceOnline ? 'ESP32 Online' : 'ESP32 Standby'}
            </span>

            {token && (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                title="Keluar dari sesi"
              >
                <LogOut className="h-3 w-3" />
                <span>Keluar</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
          <span>Koneksi Broker: {brokerOnline ? 'Terhubung (Online)' : 'Menghubungkan...'}</span>
          {token && <span className="text-emerald-400 font-medium">Sesi Aktif</span>}
        </div>
      </section>

      {/* Konten Utama: Form Login ATAU Tampilan Grafik Sensor */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        {!token ? (
          <form autoComplete="off" className="space-y-3" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Username</span>
              <input
                autoComplete="off"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none autofill:bg-slate-900 autofill:text-white focus:border-violet-500"
                name="dashboard-username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
                placeholder="Masukkan username"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Password</span>
              <input
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none autofill:bg-slate-900 autofill:text-white focus:border-violet-500"
                onChange={(event) => setPassword(event.target.value)}
                name="dashboard-password"
                required
                type="password"
                value={password}
                placeholder="Masukkan password"
              />
            </label>
            {loginError && <p className="text-sm text-rose-300" role="alert">{loginError}</p>}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              disabled={isBusy}
              type="submit"
            >
              <LogIn aria-hidden="true" className="h-4 w-4" />
              {isBusy ? 'Memproses...' : 'Masuk ke Grafik Sensor'}
            </button>
          </form>
        ) : (
          /* Setelah Login: Grafik Sensor murni menggantikan kontrol tombol ON/OFF */
          <SensorChart sensorData={sensorData} />
        )}
      </section>

      {/* Footer Info Sesi */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5">
        <p className="text-xs text-slate-400" role="status" aria-live="polite">
          {message}
        </p>
      </section>
    </div>
  )
}
