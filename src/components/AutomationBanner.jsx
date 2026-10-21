import { CloudRain, Sun, Zap } from 'lucide-react'

const ACTION_STYLES = {
  'Pompa Hidup': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'Pompa Mati [Prakiraan Hujan]': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'Pompa Mati': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

export default function AutomationBanner({ action, forecastTime, moisture, weather }) {
  const WeatherIcon = weather === 'Hujan' ? CloudRain : Sun
  const forecastLabel = forecastTime ? forecastTime.slice(11, 16) : null
  const actionStyle =
    ACTION_STYLES[action] || 'border-slate-700 bg-slate-800 text-slate-300'

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/40 p-5 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
            <Zap aria-hidden="true" className="h-3.5 w-3.5" />
            OTOMATISASI SISTEM
          </div>
          <h2 className="text-xl font-semibold text-white"></h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Keputusan dihitung dari kelembapan tanah (&lt; 40%) dan prakiraan cuaca satu jam berikutnya.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:min-w-80 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <span className="mb-2 block text-xs text-slate-500">Kelembapan Tanah</span>
            <strong className="flex items-center gap-2 text-2xl text-white">
              <Zap aria-hidden="true" className="h-5 w-5 text-sky-400" />
              {typeof moisture === 'number' ? `${moisture}%` : '—'}
            </strong>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <span className="mb-2 block text-xs text-slate-500">Prakiraan Cuaca</span>
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
              <span className="mt-1 block text-xs text-slate-500">Sekitar pukul {forecastLabel}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-800 pt-4">
        <span className="mb-2 block text-xs font-medium undercase tracking-wide text-slate-500">
          Status Pompa Saat Ini:
        </span>
        <span
          className={`inline-flex rounded-lg border px-3 py-2 text-sm font-bold ${actionStyle}`}
          role="status"
        >
          {action || 'MENUNGGU DATA SENSOR / CUACA'}
        </span>
      </div>
    </section>
  )
}
