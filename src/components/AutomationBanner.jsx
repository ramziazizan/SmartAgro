import { CloudRain, Sun, Zap } from 'lucide-react'
import MqttControlPanel from './MqttControlPanel.jsx'

const ACTION_STYLES = {
  'Pompa Hidup': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'Pompa Mati [Prakiraan Hujan]': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'Pompa Mati': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

export default function AutomationBanner({
  action,
  forecastTime,
  moisture,
  onPumpStatusUpdate,
  onTelemetryUpdate,
  pumpStatus,
  weather,
}) {
  const WeatherIcon = weather === 'Hujan' ? CloudRain : Sun
  const forecastLabel = forecastTime ? forecastTime.slice(11, 16) : null
  const actionStyle =
    ACTION_STYLES[action] || 'border-slate-700 bg-slate-800 text-slate-300'
  const moistureLabel =
    typeof moisture === 'number'
      ? `${moisture.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
      : null
  const decisionReason = (() => {
    if (typeof moisture !== 'number') return 'Menunggu data kelembapan tanah.'
    if (moisture >= 40) {
      return `Kelembapan ${moistureLabel} sudah mencapai ambang 40%, jadi sistem merekomendasikan pompa mati.`
    }
    if (weather === 'Cerah') {
      return `Kelembapan ${moistureLabel} di bawah 40% dan cuaca cerah, jadi sistem merekomendasikan pompa hidup.`
    }
    if (weather === 'Hujan') {
      return `Kelembapan ${moistureLabel} di bawah 40%, tetapi cuaca diprediksi hujan, jadi sistem merekomendasikan pompa mati.`
    }
    return `Kelembapan ${moistureLabel} di bawah 40%; menunggu prakiraan cuaca untuk menentukan tindakan.`
  })()
  const actualPumpStatus = !pumpStatus
    ? 'Login MQTT untuk melihat status aktual pompa.'
    : !pumpStatus.online
      ? 'ESP32 offline; status aktual pompa belum tersedia.'
      : typeof pumpStatus.pumpOn !== 'boolean'
        ? 'ESP32 online, tetapi status aktual pompa belum tersedia.'
        : `Pompa aktual sedang ${pumpStatus.pumpOn ? 'menyala' : 'mati'}.`

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/40 p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
            <Zap aria-hidden="true" className="h-3.5 w-3.5" />
            OTOMATISASI SISTEM
          </div>
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
                <span className="mt-1 block text-xs text-slate-500">
                  Sekitar pukul: {forecastLabel}
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium undercase tracking-wide text-slate-500 sm:text-xs">
                Rekomendasi tindakan untuk saat ini:
              </span>
              <span
                className={`inline-flex shrink-0 whitespace-nowrap rounded-lg border px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${actionStyle}`}
                role="status"
              >
                {action || 'MENUNGGU DATA SENSOR / CUACA'}
              </span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="mb-2 block text-xs font-medium text-slate-500">
                Status pompa aktual
              </span>
              <p className="text-sm leading-relaxed text-slate-300">{actualPumpStatus}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold text-white">Ringkasan Keputusan</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{decisionReason}</p>
          </div>
        </div>

        <MqttControlPanel
          onPumpStatusUpdate={onPumpStatusUpdate}
          onTelemetryUpdate={onTelemetryUpdate}
        />
      </div>
    </section>
  )
}
