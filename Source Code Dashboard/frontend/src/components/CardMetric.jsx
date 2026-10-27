export default function CardMetric({ title, value, unit, icon, detail }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-700">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-slate-400">{title}</h3>
        <span className="rounded-lg border border-slate-800 bg-slate-950 p-2 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </div>
      <p className="break-all text-xl font-bold text-white sm:text-2xl">
        {value === null || value === undefined || value === '' ? '—' : value}
        {unit && value !== null && value !== undefined && value !== '' ? (
          <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>
        ) : null}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </article>
  )
}
