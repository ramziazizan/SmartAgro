import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  Cpu,
  Droplets,
  FlaskConical,
  Leaf,
  ShieldCheck,
  Thermometer,
  Zap,
} from 'lucide-react'
import { fetchSensorFromCSV, fetchWeather } from './services/api.js'
import AutomationBanner from './components/AutomationBanner.jsx'
import Header from './components/Header.jsx'
import MetricsGrid from './components/MetricsGrid.jsx'

const REFRESH_INTERVAL = 30_000

function getAutomationAction(moisture, weather) {
  if (typeof moisture !== 'number') return null
  if (moisture >= 40) return 'Pompa Mati'
  if (weather === 'Cerah') return 'Pompa Hidup'
  if (weather === 'Hujan') return 'Pompa Mati [Prakiraan Hujan]'
  return null
}

export default function App() {
  const [sensorData, setSensorData] = useState(null)
  const [weather, setWeather] = useState(null)
  const [sensorError, setSensorError] = useState('')
  const [weatherError, setWeatherError] = useState('')
  const [syncStatus, setSyncStatus] = useState('syncing')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const requestInProgress = useRef(false)

  const refreshData = useCallback(async () => {
    if (requestInProgress.current) return

    requestInProgress.current = true
    setIsRefreshing(true)
    setSyncStatus('syncing')

    const [sensorResult, weatherResult] = await Promise.allSettled([
      fetchSensorFromCSV(),
      fetchWeather(),
    ])

    if (sensorResult.status === 'fulfilled') {
      setSensorData(sensorResult.value)
      setSensorError('')
    } else {
      console.error('Gagal mengambil data sensor:', sensorResult.reason)
      setSensorData(null)
      setSensorError('Data sensor gagal dimuat. Periksa koneksi atau akses spreadsheet.')
    }

    if (weatherResult.status === 'fulfilled') {
      setWeather(weatherResult.value)
      setWeatherError('')
    } else {
      console.error('Gagal mengambil data cuaca:', weatherResult.reason)
      setWeather(null)
      setWeatherError('Data cuaca gagal dimuat. Keputusan otomatisasi memerlukan data cuaca.')
    }

    setLastUpdated(new Date())
    setSyncStatus(
      sensorResult.status === 'fulfilled' && weatherResult.status === 'fulfilled'
        ? 'synced'
        : 'error',
    )
    requestInProgress.current = false
    setIsRefreshing(false)
  }, [])

  useEffect(() => {
    const initialRefreshId = window.setTimeout(refreshData, 0)
    const intervalId = window.setInterval(refreshData, REFRESH_INTERVAL)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(intervalId)
    }
  }, [refreshData])

  const moisture = sensorData?.moisture
  const action = getAutomationAction(moisture, weather?.condition)
  const metrics = [
    {
      title: 'Air / Kelembapan',
      value: moisture,
      unit: '%',
      icon: <Droplets className="text-sky-400" />,
    },
    {
      title: 'Suhu',
      value: sensorData?.temperature,
      unit: '°C',
      icon: <Thermometer className="text-amber-400" />,
    },
    {
      title: 'pH',
      value: sensorData?.ph,
      unit: 'pH',
      icon: <Activity className="text-emerald-400" />,
    },
    {
      title: 'EC',
      value: sensorData?.ec,
      unit: 'µS/cm',
      icon: <Zap className="text-violet-400" />,
    },
    {
      title: 'Nitrogen (N)',
      value: sensorData?.nitrogen,
      unit: 'mg/kg',
      icon: <Leaf className="text-green-400" />,
    },
    {
      title: 'Fosfor (P)',
      value: sensorData?.phosphorus,
      unit: 'mg/kg',
      icon: <FlaskConical className="text-lime-400" />,
    },
    {
      title: 'Kalium (K)',
      value: sensorData?.potassium,
      unit: 'mg/kg',
      icon: <Leaf className="text-teal-400" />,
    },
    {
      title: 'Status / Device ID',
      value: sensorData?.deviceId || '—',
      unit: '',
      detail: sensorData?.deviceId ? 'Perangkat terdeteksi' : 'Menunggu data perangkat',
      icon: <ShieldCheck className="text-indigo-400" />,
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <Header
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        onRefresh={refreshData}
        syncStatus={syncStatus}
      />

      <main className="mx-auto mt-8 max-w-7xl space-y-6">
        {(sensorError || weatherError) && (
          <div
            className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            {sensorError && <p>{sensorError}</p>}
            {weatherError && <p>{weatherError}</p>}
          </div>
        )}

        <AutomationBanner
          action={action}
          forecastTime={weather?.forecastTime}
          moisture={moisture}
          weather={weather?.condition}
        />

        <section aria-label="Metrik sensor">
          <div className="mb-4 flex items-center gap-2">
            <Cpu aria-hidden="true" className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Metrik Sensor</h2>
            {sensorData?.timestamp && (
              <span className="ml-auto text-right text-xs text-slate-500">
                Periode: {sensorData.timestamp}
              </span>
            )}
          </div>
          <MetricsGrid metrics={metrics} />
        </section>
      </main>
    </div>
  )
}
