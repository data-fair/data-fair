export interface StepDelta {
  routeName: string
  step: string
  count: number
  totalMs: number
  avgMs: number
}

export interface MetricsSnapshot {
  steps: Map<string, { count: number, sum: number }>
  rssBytes: number | null
}

const observerPort = process.env.DEV_OBSERVER_PORT || '5319'
const metricsUrl = process.env.BENCHMARK_METRICS_URL || `http://localhost:${observerPort}/metrics`

let warned = false

/** Scrape the prometheus observer; returns null (warning once) when the observer is unreachable */
export async function sampleMetrics (): Promise<MetricsSnapshot | null> {
  let text: string
  try {
    const res = await fetch(metricsUrl, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) throw new Error(`status ${res.status}`)
    text = await res.text()
  } catch (err) {
    if (!warned) {
      console.log(`  (observer not reachable at ${metricsUrl}, skipping server-side metrics: ${err})`)
      warned = true
    }
    return null
  }

  const steps = new Map<string, { count: number, sum: number }>()
  let rssBytes: number | null = null
  for (const line of text.split('\n')) {
    let m = /^df_req_step_seconds_(sum|count)\{(.*)\} (\S+)$/.exec(line)
    if (m) {
      const entry = steps.get(m[2]) ?? { count: 0, sum: 0 }
      if (m[1] === 'sum') entry.sum = Number(m[3])
      else entry.count = Number(m[3])
      steps.set(m[2], entry)
      continue
    }
    m = /^process_resident_memory_bytes (\S+)$/.exec(line)
    if (m) rssBytes = Number(m[1])
  }
  return { steps, rssBytes }
}

const parseLabels = (labels: string) => {
  const routeName = /routeName="([^"]*)"/.exec(labels)?.[1] ?? labels
  const step = /step="([^"]*)"/.exec(labels)?.[1] ?? ''
  return { routeName, step }
}

export function diffSteps (before: MetricsSnapshot | null, after: MetricsSnapshot | null, top = 10): StepDelta[] | undefined {
  if (!before || !after) return undefined
  const deltas: StepDelta[] = []
  for (const [labels, a] of after.steps) {
    const b = before.steps.get(labels) ?? { count: 0, sum: 0 }
    const count = a.count - b.count
    if (count <= 0) continue
    const totalMs = (a.sum - b.sum) * 1000
    const { routeName, step } = parseLabels(labels)
    deltas.push({ routeName, step, count, totalMs, avgMs: totalMs / count })
  }
  return deltas.sort((d1, d2) => d2.totalMs - d1.totalMs).slice(0, top)
}

export function rssDeltaMb (before: MetricsSnapshot | null, after: MetricsSnapshot | null): number | undefined {
  if (before?.rssBytes == null || after?.rssBytes == null) return undefined
  return (after.rssBytes - before.rssBytes) / 1024 / 1024
}
