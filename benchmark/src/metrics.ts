export interface Aggregated {
  median: number
  min: number
  max: number
  mean: number
  stddev: number
}

/** Aggregate a list of numeric samples. Median is the headline metric. */
export function aggregate (samples: number[]): Aggregated {
  if (samples.length === 0) throw new Error('aggregate: empty samples')
  const sorted = [...samples].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((s, x) => s + x, 0) / n
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  const mid = Math.floor(n / 2)
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return { median, min: sorted[0], max: sorted[n - 1], mean, stddev: Math.sqrt(variance) }
}
