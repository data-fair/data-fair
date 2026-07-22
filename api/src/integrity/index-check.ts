// api/src/integrity/index-check.ts
// Index-consistency verdict (A1): compare what users read through the ES ALIAS (never a physical
// index — a diverted alias is an in-scope attack) against the verified source of truth.
// One uniform mechanism for both dataset families: count check + seeded-random sampled _i
// windows; only the source adapter differs. Exhaustive compare rides ?deep=true (deep mode).
import crypto from 'node:crypto'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import config from '#config'
import mongo from '#mongo'
import es from '#es'
import type { DatasetInternal, Dataset } from '#types'
import { isRestDataset } from '#types/dataset/index.ts'
import { aliasName } from '../datasets/es/commons.ts'
import * as restUtils from '../datasets/utils/rest.ts'
import { readStreams as datasetReadStreams } from '../datasets/utils/data-streams.ts'
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

const esWindow = async (alias: string, pivot: number, size: number, joinByI: boolean): Promise<{ docs: iops.WindowDoc[], malformed: iops.DivergedEntry[], exhausted: boolean }> => {
  const res: any = await es.client.search({
    index: alias,
    // `range: {_i: {gte}}` alone never matches a doc missing `_i`, so an `_i`-less corrupt doc
    // would be invisible to the window (evading everything but the count check). Widen the query
    // to also pull docs with no `_i` field; they sort last (missing → last on asc) and are peeled
    // off as `malformed` below, never joining the comparable slice.
    body: {
      query: { bool: { minimum_should_match: 1, should: [{ range: { _i: { gte: pivot } } }, { bool: { must_not: { exists: { field: '_i' } } } }] } },
      sort: [{ _i: 'asc' }],
      size
    }
  })
  const hits: any[] = res.hits.hits
  const docs: iops.WindowDoc[] = []
  const malformed: iops.DivergedEntry[] = []
  for (const h of hits) {
    const i = h._source._i
    // a missing/null/non-numeric `_i` cannot be ordered or joined; record it as surplus (keyed by
    // ES `_id`) and keep it out of `docs` so it can never poison the compare's span frontier
    if (!Number.isFinite(i)) {
      malformed.push({ key: String(h._id), kind: 'surplus', actual: iops.docEvidence(iops.normalizeProjectedDoc(h._source)) })
      continue
    }
    docs.push({ join: joinByI ? String(i) : String(h._id), i, doc: iops.normalizeProjectedDoc(h._source) })
  }
  return { docs, malformed, exhausted: hits.length < size }
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

// One streaming parse serves every window of the run: rows are projected once and appended to
// each still-hungry window whose pivot they reach; the stream is destroyed as soon as all
// windows are full, so the nightly cost is bounded by one partial file parse, no ES writes.
// `node:stream`'s `compose` is only typed as an instance method (not a named export) in the
// @types/node version pinned here, so a Writable collector piped through `pipeline` (aborted
// once every window is full) stands in for it — same single-pass, early-destroy behavior.
const fileWindows = async (dataset: DatasetInternal, pivots: number[], windowSize: number): Promise<{ windows: iops.WindowDoc[][], exhausted: boolean[] }> => {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  // mirror the indexer exactly (index-lines.ts): extended file when extensions are active
  const extended = !!(dataset.extensions && dataset.extensions.some((e: any) => e.active))
  const streams = await datasetReadStreams(dataset as any, false, extended, false)
  const windows: iops.WindowDoc[][] = pivots.map(() => [])
  const controller = new AbortController()
  const collector = new Writable({
    objectMode: true,
    write (row: any, _encoding, callback) {
      (async () => {
        const i = row._i
        let projected: iops.WindowDoc | undefined
        let allFull = true
        for (let w = 0; w < pivots.length; w++) {
          if (windows[w].length >= windowSize) continue
          if (i >= pivots[w]) {
            if (!projected) {
              const doc = { ...row }
              await applyCalculations(doc)
              projected = { join: String(i), i, doc: iops.normalizeProjectedDoc(doc) }
            }
            windows[w].push(projected)
          }
          allFull = allFull && windows[w].length >= windowSize
        }
        if (allFull) controller.abort()
        callback()
      })().catch(callback)
    }
  })
  try {
    await pipeline([...streams, collector], { signal: controller.signal })
  } catch (err: any) {
    // an abort once every window is full is the expected early-stop, not a failure
    if (!controller.signal.aborted) throw err
  }
  return { windows, exhausted: windows.map((w) => w.length < windowSize) }
}

const DEEP_BATCH = 1000

// Exhaustive _i-ordered walk of the ES side through the alias (never the physical index — a
// diverted alias is an in-scope attack). `_doc` tiebreak keeps search_after stable when an
// adversary inserted duplicate _i values.
async function * esIterate (alias: string, joinByI: boolean, record: (entries: iops.DivergedEntry[]) => void): AsyncGenerator<iops.WindowDoc> {
  let searchAfter: any[] | undefined
  while (true) {
    const res: any = await es.client.search({
      index: alias,
      body: {
        query: { match_all: {} },
        sort: [{ _i: 'asc' }, { _doc: { order: 'asc' } }],
        size: DEEP_BATCH,
        ...(searchAfter ? { search_after: searchAfter } : {})
      }
    })
    const hits: any[] = res.hits.hits
    for (const h of hits) {
      const i = h._source._i
      // a missing/null/non-numeric `_i` cannot be ordered or joined; record it as surplus (keyed
      // by ES `_id`) and skip — yielding it would drop an unorderable `undefined` into
      // deepCompare's frontier (Math.min(..., undefined) → NaN empties both buffers uncompared).
      // These docs sort last (missing → last on asc) so they arrive in the final batch(es).
      if (!Number.isFinite(i)) {
        record([{ key: String(h._id), kind: 'surplus', actual: iops.docEvidence(iops.normalizeProjectedDoc(h._source)) }])
        continue
      }
      yield { join: joinByI ? String(i) : String(h._id), i, doc: iops.normalizeProjectedDoc(h._source) }
    }
    if (hits.length < DEEP_BATCH) return
    searchAfter = hits[hits.length - 1].sort
  }
}

// Exhaustive _i-ordered walk of the REST source (mongo cursor's own asyncIterator closes the
// cursor if this generator is abandoned mid-walk — nothing extra to clean up here).
async function * restIterate (dataset: DatasetInternal): AsyncGenerator<iops.WindowDoc> {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const c = restUtils.collection(dataset as any)
  for await (const line of c.find({ _deleted: { $ne: true } }).sort({ _i: 1 })) {
    yield await projectRestLine(line, applyCalculations)
  }
}

// Exhaustive walk of the file source, one streaming parse (mirrors fileWindows' single-pass
// idiom). `node:stream`'s `compose` doesn't type-check against this repo's pinned @types/node
// (see fileWindows above), so the same Writable-collector + pipeline/AbortController fallback
// stands in for it, adapted into a pull-based async generator. Draft approximation (shared with
// fileWindows): `datasetReadStreams(dataset, false, extended, false)` reads the PRODUCTION source
// (ignoreDraftLimit stays false, no `validateDraft`) — the deliberate mirror of comparing against
// the PRODUCTION alias, not a draft view.
//
// Producer→consumer handoff is a FIFO queue, NOT a single slot. When the consumer invokes an
// entry's `callback()` to ask for the next row, Node's Writable drains the next buffered chunk
// *synchronously from inside that very call* — so a second `write()` runs before the consumer has
// looped back to take the first row. A single-slot handoff would overwrite (lose) that first row
// and leave the consumer awaiting a promise no one ever resolves: a permanent hang that holds the
// per-dataset worker lock forever. The queue holds every synchronously-drained row; buffering
// stays bounded by the Writable's highWaterMark because each entry's `callback()` is withheld
// until the consumer has actually taken its row (backpressure). If the generator is abandoned
// (`.return()`, e.g. the consumer breaks out early), the `finally` block below aborts the
// controller and awaits the pipeline's settlement so the underlying streams are destroyed before
// this generator finishes tearing down (abort-induced rejection swallowed, genuine errors rethrown).
async function * fileIterate (dataset: DatasetInternal): AsyncGenerator<iops.WindowDoc> {
  const applyCalculations = prepareCalculations(dataset as unknown as Dataset)
  const extended = !!(dataset.extensions && dataset.extensions.some((e: any) => e.active))
  const streams = await datasetReadStreams(dataset as any, false, extended, false)
  const controller = new AbortController()
  type Entry = { row: any, callback: () => void }
  const queue: Entry[] = []
  let ended = false
  // one-shot wakeup: armed by the consumer only when it has drained the queue and must block;
  // fired by write()/final(). `wake()` when unarmed is a harmless no-op — the consumer re-checks
  // `queue.length` synchronously before it ever arms, so a row pushed while unarmed is never missed.
  let notify: (() => void) | null = null
  const wake = () => { if (notify) { const n = notify; notify = null; n() } }
  const collector = new Writable({
    objectMode: true,
    write (row: any, _encoding, callback) {
      queue.push({ row, callback })
      wake()
    },
    final (callback) {
      ended = true
      wake()
      callback()
    }
  })
  const pipelineDone = pipeline([...streams, collector], { signal: controller.signal }).catch((err: any) => {
    // an abort (either the natural end-of-generator cleanup below, or an early `.return()`) is
    // the expected early-stop, not a failure — only a genuine error propagates
    if (!controller.signal.aborted) throw err
  })
  try {
    while (true) {
      while (queue.length) {
        const entry = queue.shift()!
        const doc = { ...entry.row }
        await applyCalculations(doc)
        yield { join: String(entry.row._i), i: entry.row._i, doc: iops.normalizeProjectedDoc(doc) }
        // release backpressure only now — bounds the Writable's buffer to its highWaterMark. This
        // may synchronously re-enter write() and push the next chunk; the outer loop drains it.
        entry.callback()
      }
      if (ended) break
      // queue drained and stream still open: arm and block. This arm-then-await stretch is
      // synchronous (no write() can interleave between the `queue.length` test above and here),
      // and any row that arrived earlier is already in `queue` and was drained — so no wake is lost.
      await new Promise<void>((resolve) => { notify = resolve })
    }
  } finally {
    controller.abort()
    await pipelineDone
  }
}

// exhaustive compare: pull both _i-ordered sides in batches, cut each round at the smaller
// side's frontier, compare the slice with compareWindowDocs (both marked exhausted: the span
// cut already happened here), and carry the uncompared tail into the next round. Termination:
// each round either exhausts a side (recorded in sDone/eDone, letting the other side's frontier
// alone bound the span until it too runs out) or strictly advances spanEnd, since `fill` always
// tops up a still-hungry, not-yet-done buffer before the cut is computed — a round that removed
// nothing merely means one side is fully drained ahead of the other, and continued refilling of
// the lagging side is exactly what closes that gap on a later round. Both empty and both done is
// the only exit.
const deepCompare = async (source: AsyncGenerator<iops.WindowDoc>, esSide: AsyncGenerator<iops.WindowDoc>, record: (entries: iops.DivergedEntry[]) => void): Promise<number> => {
  let checked = 0
  let sBuf: iops.WindowDoc[] = []
  let eBuf: iops.WindowDoc[] = []
  let sDone = false
  let eDone = false
  const fill = async (gen: AsyncGenerator<iops.WindowDoc>, buf: iops.WindowDoc[], done: boolean): Promise<boolean> => {
    while (buf.length < DEEP_BATCH && !done) {
      const n = await gen.next()
      if (n.done) done = true
      else buf.push(n.value)
    }
    return done
  }
  try {
    while (true) {
      sDone = await fill(source, sBuf, sDone)
      eDone = await fill(esSide, eBuf, eDone)
      if (!sBuf.length && !eBuf.length) break
      let spanEnd = Infinity
      // Frontier reads guarded by Number.isFinite: esIterate/restIterate/fileIterate already peel
      // off any non-finite `_i` before a doc reaches these buffers, so in practice the last `.i`
      // is always finite — the guard is an internal-consistency fallback. Without it, a stray
      // non-finite frontier would collapse spanEnd to NaN, and `d.i <= NaN`/`d.i > NaN` are BOTH
      // false, emptying both buffers uncompared (up to DEEP_BATCH genuine docs per side skipped).
      const sLastI = sBuf.length ? sBuf[sBuf.length - 1].i : undefined
      const eLastI = eBuf.length ? eBuf[eBuf.length - 1].i : undefined
      if (!sDone && Number.isFinite(sLastI)) spanEnd = Math.min(spanEnd, sLastI as number)
      if (!eDone && Number.isFinite(eLastI)) spanEnd = Math.min(spanEnd, eLastI as number)
      const sSlice = sBuf.filter(d => d.i <= spanEnd)
      const eSlice = eBuf.filter(d => d.i <= spanEnd)
      sBuf = sBuf.filter(d => d.i > spanEnd)
      eBuf = eBuf.filter(d => d.i > spanEnd)
      // Duplicate-`_i` caveat: a group of same-`_i` docs straddling a DEEP_BATCH cut may split
      // across two rounds, so within a round its missing/surplus labels can be mislabelled — still
      // a breach, just possibly the wrong kind. compareWindowDocs joins by key into a Map, so
      // same-key duplicates in one slice collapse; the count check catches the resulting imbalance.
      const cmp = iops.compareWindowDocs(sSlice, eSlice, { sourceExhausted: true, esExhausted: true })
      checked += cmp.checked
      record(cmp.diverged)
    }
  } finally {
    // If either generator throws mid-loop (most plausibly esIterate's es.client.search), the
    // other stays suspended at its `yield` — a suspended generator's `finally` only runs via an
    // explicit `.return()`, never on GC — so without this, fileIterate's AbortController never
    // fires (file streams leak) and restIterate's mongo cursor never closes. `.return()` on an
    // already-done generator is a no-op. Swallow rejections here so cleanup can never mask the
    // original error propagating out of the try block.
    await source.return(undefined).catch(() => {})
    await esSide.return(undefined).catch(() => {})
  }
  return checked
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
  // for file datasets, dataset.count is on the metadata hash denylist (indexer-churn field,
  // see EXCLUDED_TOP_LEVEL) — this compare is a cheap tripwire, hint-grade, not a proof; an
  // adversary who forges dataset.count alongside ES is still caught by the sampled windows /
  // deep compare below, which re-derive rows from the file itself (file hash covers those bytes)
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

  if (opts?.deep) {
    const source = isRest ? restIterate(dataset) : fileIterate(dataset)
    checked = await deepCompare(source, esIterate(alias, !isRest, record), record)
  } else if (expectedCount > 0) {
    const seed = opts?.seed ?? crypto.randomUUID()
    let minI: number | undefined, maxI: number | undefined
    if (isRest) {
      const c = restUtils.collection(dataset as any)
      const first = await c.find({ _deleted: { $ne: true } }).sort({ _i: 1 }).limit(1).toArray()
      const last = await c.find({ _deleted: { $ne: true } }).sort({ _i: -1 }).limit(1).toArray()
      if (first.length && last.length) { minI = first[0]._i; maxI = last[0]._i }
    } else {
      // file _i is a dense 1-based row counter; dataset.count (metadata-denylisted, hint-grade —
      // not hash-covered) only bounds the pivot range; the windows read below re-derive rows
      // from the file, whose bytes are what the file hash actually covers
      minI = 1
      maxI = dataset.count ?? 1
    }
    if (minI !== undefined && maxI !== undefined) {
      const pivots = iops.samplePivots(seed, cfg.windows, minI, maxI)
      const source = isRest
        ? await restWindows(dataset, pivots, cfg.windowSize)
        : await fileWindows(dataset, pivots, cfg.windowSize)
      for (let w = 0; w < pivots.length; w++) {
        const esw = await esWindow(alias, pivots[w], cfg.windowSize, !isRest)
        const cmp = iops.compareWindowDocs(source.windows[w], esw.docs, { sourceExhausted: source.exhausted[w], esExhausted: esw.exhausted })
        checked += cmp.checked
        record(cmp.diverged)
        // malformed (`_i`-less) ES docs the window surfaced: divergences in their own right,
        // outside the _i-ordered join — deduped by `surplus:<_id>` in the caller's evidence pass
        record(esw.malformed)
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
