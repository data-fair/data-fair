// One measured page: CDP metrics, an injected probe (long tasks, animation frames),
// a counter of /lines requests, and the spans the scenarios are measured over.
import type { BrowserContext, CDPSession, Page } from 'playwright'
import type { RunRecord } from './compare.ts'

export function p95 (values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(0.95 * sorted.length) - 1]
}

export function framesP95 (timestamps: number[], start: number, end: number): number {
  const inSpan = timestamps.filter(t => t >= start && t <= end)
  const deltas: number[] = []
  for (let i = 1; i < inSpan.length; i++) deltas.push(inSpan[i] - inSpan[i - 1])
  return p95(deltas)
}

// runs in the page before any of its own scripts
const probeScript = () => {
  const perf = { longTasks: [] as [number, number][], frames: [] as number[] }
  ;(window as any).__perf = perf
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) perf.longTasks.push([e.startTime, e.duration])
  }).observe({ type: 'longtask', buffered: true })
  const loop = (t: number) => { perf.frames.push(t); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
}

export interface Instrumented { page: Page, cdp: CDPSession, lines: { count: number, inFlight: number } }

const isLinesRequest = (url: string) => /\/api\/v1\/datasets\/[^/]+\/lines(\?|$)/.test(url)

export async function openInstrumentedPage (context: BrowserContext, opts: { throttle: boolean }): Promise<Instrumented> {
  await context.addInitScript(probeScript)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  if (opts.throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const lines = { count: 0, inFlight: 0 }
  page.on('request', r => { if (isLinesRequest(r.url())) { lines.count++; lines.inFlight++ } })
  const done = (r: { url: () => string }) => { if (isLinesRequest(r.url())) lines.inFlight-- }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  return { page, cdp, lines }
}

export async function settle (h: Instrumented): Promise<void> {
  let quietSince = Date.now()
  while (Date.now() - quietSince < 300) {
    if (h.lines.inFlight > 0) quietSince = Date.now()
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  await h.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

const getMetrics = async (cdp: CDPSession): Promise<Record<string, number>> => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(m => [m.name, m.value]))
}

export interface SpanStart { t: number, metrics: Record<string, number>, linesCount: number }

/** `fromNavigation`: the span starts with the next navigation (load scenario). Its page
 * clock starts at 0 and the renderer may be new, so the metrics baseline is zero. */
export async function beginSpan (h: Instrumented, fromNavigation = false): Promise<SpanStart> {
  if (fromNavigation) return { t: 0, metrics: {}, linesCount: h.lines.count }
  return { t: await h.page.evaluate(() => performance.now()), metrics: await getMetrics(h.cdp), linesCount: h.lines.count }
}

export async function endSpan (h: Instrumented, start: SpanStart): Promise<RunRecord> {
  const metrics = await getMetrics(h.cdp)
  const delta = (name: string) => ((metrics[name] ?? 0) - (start.metrics[name] ?? 0)) * 1000
  const page = await h.page.evaluate(() => {
    const perf = (window as any).__perf as { longTasks: [number, number][], frames: number[] }
    return {
      now: performance.now(),
      longTasks: perf.longTasks,
      frames: perf.frames,
      domNodes: document.getElementsByTagName('*').length,
      renderedRows: document.querySelectorAll('.dataset-table tbody tr').length
    }
  })
  const longTasks = page.longTasks.filter(([t]) => t >= start.t && t <= page.now)
  return {
    spanMs: page.now - start.t,
    scriptMs: delta('ScriptDuration'),
    layoutMs: delta('LayoutDuration'),
    styleMs: delta('RecalcStyleDuration'),
    taskMs: delta('TaskDuration'),
    longTaskCount: longTasks.length,
    longTaskMs: longTasks.reduce((sum, [, d]) => sum + d, 0),
    frameP95Ms: framesP95(page.frames, start.t, page.now),
    domNodes: page.domNodes,
    renderedRows: page.renderedRows,
    linesRequests: h.lines.count - start.linesCount,
    heapMB: (metrics.JSHeapUsedSize ?? 0) / 1024 / 1024
  }
}
