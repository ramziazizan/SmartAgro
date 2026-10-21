import CardMetric from './CardMetric.jsx'

export default function MetricsGrid({ metrics }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <CardMetric key={metric.title} {...metric} />
      ))}
    </div>
  )
}
