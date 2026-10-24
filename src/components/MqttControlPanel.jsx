import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut, Power, Wifi, WifiOff } from 'lucide-react'
import {
  getMqttApiHealth,
  getMqttDeviceSnapshot,
  logInToMqttApi,
  sendMqttPumpCommand,
} from '../services/mqttApi.js'

const STATUS_POLL_INTERVAL = 15_000
const HEALTH_POLL_INTERVAL = 60_000

export default function MqttControlPanel({ onPumpStatusUpdate, onTelemetryUpdate }) {
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [pumpOn, setPumpOn] = useState(null)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [brokerOnline, setBrokerOnline] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('Login for connected to MQTT.')

  const checkHealth = useCallback(async () => {
    try {
      const health = await getMqttApiHealth()
      setBrokerOnline(Boolean(health.mqtt?.connected))
      if (!health.mqtt?.configured) {
        setMessage('Broker MQTT belum dikonfigurasi pada backend.')
      } else if (!health.mqtt.connected) {
        setMessage('Backend aktif, sedang menunggu koneksi broker MQTT.')
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
      setPumpOn(nextPumpStatus.pumpOn)
      setDeviceOnline(nextPumpStatus.online)
      onPumpStatusUpdate(nextPumpStatus)
      if (snapshot.online) setMessage('Status ESP32 tersinkron melalui MQTT.')
      else setMessage('Menunggu feedback ESP32.')
      onTelemetryUpdate(snapshot.telemetry)
    } catch (error) {
      onPumpStatusUpdate(null)
      onTelemetryUpdate(null)
      if (error.status === 401) {
        setToken('')
        setPumpOn(null)
        setDeviceOnline(false)
        setMessage('Sesi login berakhir. Silakan login kembali.')
      } else {
        setPumpOn(null)
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
      setMessage('Login berhasil. Menghubungkan ke ESP32...')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setPumpOn(null)
    setDeviceOnline(false)
    onPumpStatusUpdate(null)
    onTelemetryUpdate(null)
    setMessage('Login for connected to MQTT.')
  }

  const handleCommand = async (command) => {
    if (!token || isBusy) return
    if (
      command === 'ON' &&
      !window.confirm('Yakin ingin menghidupkan pompa secara manual?')
    ) {
      return
    }

    setIsBusy(true)
    setMessage('Mengirim perintah melalui MQTT...')
    try {
      await sendMqttPumpCommand(token, command)
      setMessage(`Perintah ${command} dikirim. Menunggu feedback ESP32.`)
      window.setTimeout(checkDevice, 500)
    } catch (error) {
      if (error.status === 401) handleLogout()
      else setMessage(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-white">Pump Control</h3>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
              deviceOnline
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
            aria-live="polite"
          >
            {deviceOnline ? (
              <Wifi aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {deviceOnline ? 'ESP32 Online' : 'ESP32 Offline'}
          </span>
        </div>

        <div className="mt-3 text-xs text-slate-400" aria-live="polite">
          Stats Broker: {brokerOnline ? 'Terhubung' : 'Belum terhubung'}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        {!token ? (
          <form autoComplete="off" className="space-y-3" onSubmit={handleLogin}>
            <p className="text-xs text-slate-400"></p>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Username</span>
              <input
                autoComplete="off"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none autofill:bg-slate-900 autofill:text-white focus:border-violet-500"
                name="dashboard-username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
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
              />
            </label>
            {loginError && <p className="text-sm text-rose-300" role="alert">{loginError}</p>}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              disabled={isBusy}
              type="submit"
            >
              <LogIn aria-hidden="true" className="h-4 w-4" />
              {isBusy ? 'Memproses...' : 'Login'}
            </button>
          </form>
        ) : (
          <>
            <div
              className={`rounded-lg border px-4 py-3 text-center text-lg font-bold ${
                pumpOn === true
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : pumpOn === false
                    ? 'border-slate-700 bg-slate-900 text-slate-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
              aria-live="polite"
            >
              {pumpOn === null ? 'STATUS POMPA BELUM TERSEDIA' : pumpOn ? 'POMPA ON' : 'POMPA OFF'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || !brokerOnline}
                onClick={() => handleCommand('ON')}
                type="button"
              >
                <Power aria-hidden="true" className="h-4 w-4" />
                Hidupkan
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || !brokerOnline}
                onClick={() => handleCommand('OFF')}
                type="button"
              >
                <Power aria-hidden="true" className="h-4 w-4" />
                Matikan
              </button>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-h-5 text-xs text-slate-400" role="status" aria-live="polite">
            {message}
          </p>
          {token && (
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 sm:ml-auto"
              onClick={handleLogout}
              type="button"
            >
              <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
              Keluar
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
