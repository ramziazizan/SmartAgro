import { RefreshCw, Sprout } from 'lucide-react'

const SYNC_LABELS = {
  syncing: 'Sedang sinkronisasi',
  synced: 'Tersinkron',
  error: 'Sinkronisasi bermasalah',
}

export default function Header({ isRefreshing, lastUpdated, onRefresh, syncStatus }) {
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Belum ada'

  return (
    <header className="mx-auto flex max-w-7xl flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2 text-violet-300">
            <Sprout aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Smart Agro
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Telemetri sensor dan otomasi berbasis prakiraan cuaca
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300"
          aria-live="polite"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              syncStatus === 'synced'
                ? 'bg-emerald-400'
                : syncStatus === 'error'
                  ? 'bg-rose-400'
                  : 'bg-amber-400'
            }`}
          />
          <span>{SYNC_LABELS[syncStatus]} · {lastUpdatedLabel}</span>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
          disabled={isRefreshing}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </header>
  )
}
