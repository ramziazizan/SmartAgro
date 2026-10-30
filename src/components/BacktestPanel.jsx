import { useState } from 'react'
import { FlaskConical, ChevronDown, ChevronUp, Zap, CheckCircle, AlertTriangle } from 'lucide-react'
import { getPumpAutomationDecision } from '../services/automationLogic.js'
import {
  WEATHER_SCENARIOS,
  MOISTURE_TEST_CASES,
  ZONE_STYLES,
} from '../services/backtestData.js'

// Jalankan semua kombinasi cuaca × moisture dan kumpulkan hasilnya
function runBacktest() {
  return MOISTURE_TEST_CASES.map((mc) => ({
    ...mc,
    results: WEATHER_SCENARIOS.map((ws) => ({
      ...ws,
      decision: getPumpAutomationDecision({
        moisture: mc.moisture,
        weather: ws.condition,
        precipitationProbability: ws.precipitationProbability,
      }),
    })),
  }))
}

function ActionBadge({ decision }) {
  const isPumpOn = decision.statusType === 'pump_on'
  const isSaturated = decision.category === 'saturated'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold leading-tight ${decision.badgeStyle}`}
      title={decision.reason}
    >
      {isPumpOn ? (
        <Zap className="h-3 w-3 shrink-0 text-emerald-400" />
      ) : isSaturated ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
      ) : (
        <CheckCircle className="h-3 w-3 shrink-0 text-sky-400" />
      )}
      {decision.action}
    </span>
  )
}

export default function BacktestPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState(null)
  const backtestRows = runBacktest()

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/20">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-800/40"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
            <FlaskConical className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Backtest Logika Otomasi Pompa</h3>
            <p className="text-xs text-slate-400">
              {MOISTURE_TEST_CASES.length} skenario kelembapan × {WEATHER_SCENARIOS.length} kondisi cuaca ={' '}
              <strong className="text-violet-300">{MOISTURE_TEST_CASES.length * WEATHER_SCENARIOS.length} kombinasi</strong>
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-slate-800 px-5 pb-5 pt-4 space-y-4">
          {/* Filter skenario cuaca */}
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-slate-400">Filter Cuaca:</span>
            <button
              type="button"
              onClick={() => setSelectedScenario(null)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                selectedScenario === null
                  ? 'border-violet-500 bg-violet-500/20 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              Semua
            </button>
            {WEATHER_SCENARIOS.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => setSelectedScenario(ws.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  selectedScenario === ws.id
                    ? 'border-violet-500 bg-violet-500/20 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {ws.icon} {ws.label}
              </button>
            ))}
          </div>

          {/* Tabel hasil backtest */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-300">
                    Kelembapan Tanah
                  </th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-300">Zona</th>
                  {(selectedScenario
                    ? WEATHER_SCENARIOS.filter((ws) => ws.id === selectedScenario)
                    : WEATHER_SCENARIOS
                  ).map((ws) => (
                    <th key={ws.id} className="px-2 py-2.5 text-center font-semibold text-slate-300">
                      <span title={ws.description}>
                        {ws.icon} {ws.label}
                        <br />
                        <span className="font-normal text-slate-500">({ws.precipitationProbability}% hujan)</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backtestRows.map((row, rowIdx) => {
                  const zoneStyle = ZONE_STYLES[row.zone]
                  const filteredResults = selectedScenario
                    ? row.results.filter((r) => r.id === selectedScenario)
                    : row.results

                  return (
                    <tr
                      key={row.moisture}
                      className={`border-b border-slate-800/60 transition ${
                        rowIdx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'
                      } hover:bg-slate-800/30`}
                    >
                      <td className="px-3 py-2.5 font-mono font-semibold text-white">
                        {row.moisture}%
                        <span className="ml-1 font-sans font-normal text-slate-500">
                          ({row.label.split('(')[0].trim()})
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${zoneStyle.bg} ${zoneStyle.border} ${zoneStyle.text}`}
                        >
                          {zoneStyle.label}
                        </span>
                      </td>
                      {filteredResults.map((result) => (
                        <td key={result.id} className="px-2 py-2 text-center">
                          <ActionBadge decision={result.decision} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300">Keterangan:</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-emerald-400" /> Pompa Hidup</span>
            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-sky-400" /> Pompa Mati (normal)</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-rose-400" /> Pompa Mati (waspada)</span>
            <span className="ml-auto text-slate-500 italic">Hover badge untuk melihat alasan keputusan</span>
          </div>
        </div>
      )}
    </section>
  )
}

