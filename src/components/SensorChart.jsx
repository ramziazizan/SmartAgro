import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import {
  Activity,
  CheckCircle2,
  Droplets,
  FlaskConical,
  Info,
  Leaf,
  LineChart as LineChartIcon,
  Thermometer,
  Zap,
} from 'lucide-react'
import {
  extractParamValue,
  SENSOR_PARAMS,
} from '../services/cropAnalytics.js'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const PARAM_ICONS = {
  kelembapan: Droplets,
  suhu: Thermometer,
  ph: Activity,
  ec: Zap,
  n: Leaf,
  p: FlaskConical,
  k: Leaf,
}

export default function SensorChart({ sensorData }) {
  const [activeParamKey, setActiveParamKey] = useState('kelembapan')
  const canvasRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const chartCanvasId = useId()

  const activeParam = SENSOR_PARAMS[activeParamKey] || SENSOR_PARAMS.kelembapan

  // Dapatkan riwayat data
  const historyList = useMemo(() => {
    if (sensorData?.history && Array.isArray(sensorData.history) && sensorData.history.length > 0) {
      return sensorData.history
    }
    if (sensorData) {
      return [sensorData]
    }
    return []
  }, [sensorData])

  // Hitung metrik ringkasan (min, max, avg, current)
  const stats = useMemo(() => {
    const values = historyList
      .map((item) => extractParamValue(item, activeParamKey))
      .filter((v) => typeof v === 'number')

    if (values.length === 0) {
      const current = extractParamValue(sensorData, activeParamKey)
      return {
        current: current !== null ? current : null,
        min: current !== null ? current : null,
        max: current !== null ? current : null,
        avg: current !== null ? current : null,
        isOptimal: current !== null ? current >= activeParam.idealMin && current <= activeParam.idealMax : false,
      }
    }

    const current = values[values.length - 1]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
    const isOptimal = current >= activeParam.idealMin && current <= activeParam.idealMax

    return { current, min, max, avg, isOptimal }
  }, [historyList, activeParamKey, sensorData, activeParam])

  // Inisialisasi dan pembaruan Chart.js
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const labels = historyList.map((item) => item.timeShort || item.timestamp?.slice(11, 16) || '•')
    const dataPoints = historyList.map((item) => extractParamValue(item, activeParamKey))

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    // Gradient fill halus
    const gradient = ctx.createLinearGradient(0, 0, 0, 220)
    gradient.addColorStop(0, activeParam.colorFill)
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.01)')

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: activeParam.label,
            data: dataPoints,
            borderColor: activeParam.color,
            backgroundColor: gradient,
            borderWidth: 2.2,
            pointRadius: dataPoints.length > 25 ? 0 : 3,
            pointHoverRadius: 5,
            pointBackgroundColor: activeParam.color,
            pointBorderColor: '#0f172a',
            pointBorderWidth: 1.5,
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#f8fafc',
            titleFont: { size: 11, family: 'Inter, sans-serif' },
            bodyFont: { size: 12, weight: 'bold', family: 'Inter, sans-serif' },
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y
                return `${activeParam.label}: ${val} ${activeParam.unit}`
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(51, 65, 85, 0.25)',
            },
            ticks: {
              color: '#64748b',
              font: { size: 10 },
              maxTicksLimit: 7,
            },
          },
          y: {
            grid: {
              color: 'rgba(51, 65, 85, 0.25)',
            },
            ticks: {
              color: '#94a3b8',
              font: { size: 10 },
              callback: (value) => `${value} ${activeParam.unit}`,
            },
            suggestedMin: activeParam.min,
            suggestedMax: activeParam.idealMax * 1.15,
          },
        },
      },
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [activeParamKey, historyList, activeParam])

  return (
    <div className="space-y-3.5">
      {/* Header Info Grafik */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <LineChartIcon className="h-4 w-4 text-violet-400" />
          <span>Grafik {activeParam.label}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{historyList.length} Titik Sampel</span>
        </div>
      </div>

      {/* Parameter Selectors */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {Object.keys(SENSOR_PARAMS).map((key) => {
          const param = SENSOR_PARAMS[key]
          const Icon = PARAM_ICONS[key] || Activity
          const isSelected = activeParamKey === key

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveParamKey(key)}
              className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 font-medium transition ${
                isSelected
                  ? 'border-violet-500 bg-violet-500/20 text-white'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{ color: isSelected ? param.color : undefined }}
              />
              <span>{param.label}</span>
            </button>
          )
        })}
      </div>

      {/* Area Canvas Grafik */}
      <div className="relative h-52 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 sm:h-56">
        <canvas id={chartCanvasId} ref={canvasRef} />
      </div>

      {/* Stat Ringkasan Parameter */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Nilai Terkini</span>
          <p className="mt-0.5 text-base font-bold text-white">
            {stats.current !== null ? stats.current : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{activeParam.unit}</span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Terendah (Min)</span>
          <p className="mt-0.5 text-base font-bold text-sky-400">
            {stats.min !== null ? stats.min : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{activeParam.unit}</span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Rata-rata</span>
          <p className="mt-0.5 text-base font-bold text-amber-400">
            {stats.avg !== null ? stats.avg : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{activeParam.unit}</span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Tertinggi (Max)</span>
          <p className="mt-0.5 text-base font-bold text-rose-400">
            {stats.max !== null ? stats.max : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{activeParam.unit}</span>
          </p>
        </div>
      </div>

      {/* Indikator Rentang Ideal */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-400">
            Rentang Ideal: <strong className="text-slate-200">{activeParam.idealMin} – {activeParam.idealMax} {activeParam.unit}</strong>
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px] ${
            stats.isOptimal
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
          }`}
        >
          {stats.isOptimal ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              Kondisi Optimal
            </>
          ) : (
            <>
              <Info className="h-3 w-3" />
              Di Luar Rentang Ideal
            </>
          )}
        </span>
      </div>
    </div>
  )
}
