// api/src/integrity/index-check.ts
// Index-consistency verdict (A1): compare what users read through the ES ALIAS (never a physical
// index — a diverted alias is an in-scope attack) against the verified source of truth.
// One uniform mechanism for both dataset families: count check + seeded-random sampled _i
// windows; only the source adapter differs. Exhaustive compare rides ?deep=true (deep mode).
import crypto from 'node:crypto'
import config from '#config'
import mongo from '#mongo'
import es from '#es'
import type { DatasetInternal, Dataset } from '#types'
import { isRestDataset } from '#types/dataset/index.ts'
import { aliasName } from '../datasets/es/commons.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import { prepareCalculations } from '../datasets/utils/extensions.ts'
import { stripTransientLineFlags } from '../datasets/utils/line-flags.ts'
import * as iops from './index-operations.ts'

export type IndexCheckResult = {
  status: 'ok' | 'diverged' | 'unknown'
  checked?: number
  diverged?: number
  sample?: iops.DivergedEntry[]
  count?: { expected: number, actual: number }
}

// cap accumulated evidence entries in memory (deep mode can diverge massively); the count keeps
// counting past the cap, only the retained entries stop growing
const EVIDENCE_CAP = 1000

const indexConfig = () => ({
  windows: config.integrity?.index?.windows ?? 8,
  windowSize: config.integrity?.index?.windowSize ?? 128,
  sampleCap: config.integrity?.index?.sampleCap ?? 5
})

// mirror of the indexer's REST projection (index-stream cleanItem + _id extraction + calculations)
const projectRestLine = async (line: Record<string, any>, applyCalculations: (item: any) => Promise<string | null>): Promise<iops.WindowDoc> => {
  const doc: Record<string, any> = { ...line }
  doc._i = doc._i || (doc._updatedAt as Date)?.getTime()
  stripTransientLineFlags(doc)
  delete doc._hash
  delete doc._deleted
  const join = String(doc._id)
  delete doc._id
  await applyCalculations(doc)
  return { join, i: doc._i, doc: iops.normalizeProjectedDoc(doc) }
}

const esWindow = async (alias: string, pivot: number, size: number, joinByI: boolean): Promise<{ docs: iops.WindowDoc[], exhausted: boolean }> => {
  const res: any = await es.client.search({
    index: alias,
    body: { query: { range: { _i: { gte: pivot } } }, sort: [{ _i: 'asc' }], size }
  })
  const hits: any[] = res.hits.hits
  return {
    docs: hits.map((h) => ({
      join: joinByI ? String(h._source._i) : String(h._id),
      i: h._source._i,
      doc: iops.normalizeProjectedDoc(h._source)
    })),
    exhausted: hits.length < size
  }
}

const restWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const c = restUtils.collection(dataset as any)
  const windows: iops.WindowDoc[][] = []
  const exhausted: boolean[] = []
  for (const pivot of pivots) {
    const lines = await c.find({ _deleted: { $ne: true }, _i: { $gte: pivot } }).sort({ _i: 1 }).limit(windowSize).toArray()
    const docs: iops.WindowDoc[] = []
    for (const line of lines) docs.push(await projectRestLine(line, applyCalculations))
    windows.push(docs)
    exhausted.push(lines.length < windowSize)
  }
  return { windows, exhausted }
}

// Task 5 implements the real file source adapter; returning empty exhausted windows means a file
// dataset's sampled pass compares nothing yet — the count check still runs
const fileWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  return { windows: pivots.map(() => []), exhausted: pivots.map(() => true) }
}

// pending projection states: the index legitimately lags the source — verdict must not lie
const pendingState = async (dataset: DatasetInternal): Promise<boolean> => {
  if (dataset._partialRestStatus) return true
  if (isRestDataset(dataset as any)) {
    const pending = await restUtils.collection(dataset as any).findOne({ _needsIndexing: true }, { projection: { _id: 1 } })
    if (pending) return true
    // _partialRestStatus may have been set by a write racing this check — re-read the hint doc
    const fresh = await mongo.datasets.findOne({ id: dataset.id }, { projection: { _partialRestStatus: 1 } })
    return !!fresh?._partialRestStatus
  }
  return dataset.status !== 'finalized'
}

export const checkIndexConsistency = async (dataset: DatasetInternal, opts?: { deep?: boolean, seed?: string }): Promise<IndexCheckResult> => {
  const cfg = indexConfig()
  const isRest = isRestDataset(dataset as any)
  if (await pendingState(dataset)) return { status: 'unknown' }
  const alias = aliasName(dataset)
  let actualCount: number
  try {
    actualCount = (await es.client.count({ index: alias })).count
  } catch (err: any) {
    // missing alias/index while a (re)index is in flight: pending, not a breach
    if (err?.meta?.statusCode === 404 || err?.statusCode === 404) return { status: 'unknown' }
    throw err
  }
  const expectedCount = isRest
    ? await restUtils.count(dataset as any, { _deleted: { $ne: true } })
    : (dataset.count ?? 0)
  const count = { expected: expectedCount, actual: actualCount }

  let checked = 0
  let divergedCount = 0
  const evidence: iops.DivergedEntry[] = []
  const record = (entries: iops.DivergedEntry[]) => {
    divergedCount += entries.length
    for (const e of entries) if (evidence.length < EVIDENCE_CAP) evidence.push(e)
  }

  if (expectedCount > 0) {
    // Task 6 replaces this branch condition with the deep lockstep compare
    const seed = opts?.seed ?? crypto.randomUUID()
    let minI: number | undefined, maxI: number | undefined
    if (isRest) {
      const c = restUtils.collection(dataset as any)
      const first = await c.find({ _deleted: { $ne: true } }).sort({ _i: 1 }).limit(1).toArray()
      const last = await c.find({ _deleted: { $ne: true } }).sort({ _i: -1 }).limit(1).toArray()
      if (first.length && last.length) { minI = first[0]._i; maxI = last[0]._i }
    } else {
      // file _i is a dense 1-based row counter; dataset.count (metadata-covered) bounds it
      minI = 1
      maxI = dataset.count ?? 1
    }
    // isRest gate: fileWindows is a Task-4 stub (always empty) — running it against the real
    // ES window here would flag every real ES doc as "surplus" (an empty exhausted source
    // never bounds spanEnd, so nothing filters the ES side). Until Task 5 lands the real file
    // source adapter, skip the sampled compare for file datasets entirely; the count check
    // above still runs and still catches gross divergence.
    if (isRest && minI !== undefined && maxI !== undefined) {
      const pivots = iops.samplePivots(seed, cfg.windows, minI, maxI)
      const source = isRest
        ? await restWindows(dataset, pivots, cfg.windowSize)
        : await fileWindows(dataset, pivots, cfg.windowSize) // Task 5
      for (let w = 0; w < pivots.length; w++) {
        const esw = await esWindow(alias, pivots[w], cfg.windowSize, !isRest)
        const cmp = iops.compareWindowDocs(source.windows[w], esw.docs, { sourceExhausted: source.exhausted[w], esExhausted: esw.exhausted })
        checked += cmp.checked
        record(cmp.diverged)
      }
    }
  }

  // dedupe entries surfaced by overlapping windows. Careful: the `divergedCount--` below only
  // corrects entries that made it into `evidence` — if divergedCount already exceeded
  // EVIDENCE_CAP, duplicates past the cap are not corrected. Acceptable (count stays an upper
  // bound in pathological overlap).
  const seen = new Set<string>()
  const sample = evidence.filter((d) => {
    const k = `${d.kind}:${d.key}`
    if (seen.has(k)) { divergedCount--; return false }
    seen.add(k)
    return true
  })

  const divergent = divergedCount > 0 || count.expected !== count.actual
  if (divergent && await pendingState(dataset)) {
    // a legitimate write landed while we compared (line writes don't hold the worker lock):
    // its projection legitimately lags — report unknown, never a false breach
    return { status: 'unknown' }
  }
  return {
    status: divergent ? 'diverged' : 'ok',
    checked,
    diverged: divergedCount,
    sample: sample.slice(0, cfg.sampleCap),
    count
  }
}
