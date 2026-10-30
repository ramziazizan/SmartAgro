import { AlertTriangle, CheckCircle, CloudRain, Droplets, Info, Sun, Zap } from 'lucide-react'
import MqttControlPanel from './MqttControlPanel.jsx'
import { getPumpAutomationDecision } from '../services/automationLogic.js'

export default function AutomationBanner({
  action: propAction,
  decision: propDecision,
  forecastTime,
  moisture,
  onPumpStatusUpdate,
  onTelemetryUpdate,
  precipitationProbability,
  pumpStatus,
  weather,
  sensorData,
}) {
  const WeatherIcon = weather === 'Hujan' ? CloudRain : Sun
  const forecastLabel = forecastTime ? forecastTime.slice(11, 16) : null

  // Hitung keputusan jika belum disediakan melalui props
  const decision =
    propDecision ||
    getPumpAutomationDecision({
      moisture,
      weather,
      precipitationProbability,
    })

  const action = propAction || decision.action
  const actionStyle = decision.badgeStyle || 'border-slate-700 bg-slate-800 text-slate-300'
  const decisionReason = decision.reason

  const actualPumpStatus = !pumpStatus
    ? 'Status sistem terhubung dengan logika cerdas sensor & cuaca.'
    : !pumpStatus.online
      ? 'ESP32 standby; rekomendasi otomatisasi tetap aktif menganalisis data.'
      : typeof pumpStatus.pumpOn !== 'boolean'
        ? 'ESP32 online, monitoring sensor aktif.'
        : `Pompa terdeteksi sedang ${pumpStatus.pumpOn ? 'menyala' : 'mati'}.`

  // Posisi persentase untuk indikator bar kelembapan (0 - 100%)
  const moisturePct = typeof moisture === 'number' ? Math.max(0, Math.min(100, moisture)) : 0

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/40 p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
              <Zap aria-hidden="true" className="h-3.5 w-3.5" />
              Smart Irrigation System
            </div>
            {decision.categoryLabel && (
              <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                Kondisi: {decision.categoryLabel}
              </span>
            )}
          </div>

          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Otomation logic yg diambil dari data sensor moisture dan data cuaca dari API Open-Meteo.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Kelembapan Tanah</span>
                <span className="text-[11px] font-medium text-slate-400">
                  {decision.categoryLabel}
                </span>
              </div>
              <strong className="mt-2 flex items-center gap-2 text-2xl text-white">
                <Droplets aria-hidden="true" className="h-5 w-5 text-sky-400" />
                {typeof moisture === 'number' ? `${moisture}%` : '—'}
              </strong>

              {/* Progress bar visual 4 zona ambang batas */}
              <div className="mt-3">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      moisture < 20
                        ? 'bg-rose-500'
                        : moisture < 40
                          ? 'bg-amber-500'
                          : moisture <= 65
                            ? 'bg-emerald-500'
                            : 'bg-indigo-500'
                    }`}
                    style={{ width: `${moisturePct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-slate-500">
                  <span>0%</span>
                  <span>20%</span>
                  <span>40%</span>
                  <span>65%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Prakiraan Cuaca</span>
                {typeof precipitationProbability === 'number' && (
                  <span className="text-[11px] font-semibold text-sky-400">
                    Peluang Hujan: {precipitationProbability}%
                  </span>
                )}
              </div>
              <strong className="mt-2 flex items-center gap-2 text-lg text-white">
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
                  Prakiraan sekitar pukul {forecastLabel} WIB
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[11px] font-medium tracking-wide text-slate-400">
                Rekomendasi Tindakan Untuk Pompa:
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold sm:text-sm ${actionStyle}`}
                role="status"
              >
                {decision.statusType === 'pump_on' ? (
                  <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : decision.category === 'saturated' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle className="h-4 w-4 shrink-0 text-sky-400" />
                )}
                <span>{action || 'MENUNGGU DATA SENSOR / CUACA'}</span>
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Status Integrasi Pompa
              </span>
              <p className="text-xs leading-relaxed text-slate-300">{actualPumpStatus}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Info className="h-3.5 w-3.5 text-violet-400" />
              <span>Analisis &amp; Dasar Keputusan Otomasi</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{decisionReason}</p>
          </div>
        </div>

        <MqttControlPanel
          onPumpStatusUpdate={onPumpStatusUpdate}
          onTelemetryUpdate={onTelemetryUpdate}
          sensorData={sensorData}
        />
      </div>
    </section>
  )
}
