import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'
import { escapeKey } from '../datasets/utils/operations.ts'
import { WHO_SUFFIX } from './operations.ts'

// _i values (timestamp3 mode: hundredths of a second since dataset creation, plus a chunk
// discriminator) far exceed the joint anchor's 9-digit width — 16 digits keeps lexical
// order == numeric order for any realistic value
export const LINE_INDEX_WIDTH = 16
export const DELETED_MARKER = 'deleted'

// an _i outside [0, 10^16) does not fit the padding: a wider (or sign-prefixed) number breaks
// the lexical==numeric ordering of that line's whole key sequence — the relay refuses to anchor
// such a value (adversarial _i, §S4) rather than corrupt the trail's self-indexing property
export const MAX_LINE_INDEX = 10 ** LINE_INDEX_WIDTH
export const lineIndexInRange = (i: number): boolean => Number.isFinite(i) && i >= 0 && i < MAX_LINE_INDEX

export const padLineIndex = (i: number): string => String(i).padStart(LINE_INDEX_WIDTH, '0')

export const linesPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/lines/`

export const lineRevisionPrefix = (owner: { type: string, id: string }, datasetId: string, lineId: string): string =>
  `${linesPrefix(owner, datasetId)}${encodeURIComponent(lineId)}/`

// the sha256 (or the tombstone marker) is embedded in the key so the checker recovers every
// line's latest anchor hash from LIST alone — no per-object GETs
export const lineRevisionKey = (owner: { type: string, id: string }, datasetId: string, lineId: string, i: number, shaOrDeleted: string): string =>
  `${lineRevisionPrefix(owner, datasetId, lineId)}${padLineIndex(i)}-${shaOrDeleted}`

// The `.who` attribution sibling at line level (target 8), parallel to lineRevisionKey.
export const lineWhoKey = (owner: { type: string, id: string }, datasetId: string, lineId: string, i: number, shaOrDeleted: string): string =>
  lineRevisionKey(owner, datasetId, lineId, i, shaOrDeleted) + WHO_SUFFIX

export type ParsedLineKey = { lineId: string, i: number, sha256?: string, deleted: boolean }

export const parseLineRevisionKey = (key: string): ParsedLineKey | undefined => {
  const parts = key.split('/')
  // …/‹datasetId›/lines/‹encodedLineId›/‹paddedI›-‹sha|deleted›
  if (parts.length < 3 || parts[parts.length - 3] !== 'lines') return undefined
  const last = parts[parts.length - 1]
  // explicit sibling exclusion (not lexical luck): a `‹i›-‹sha›.who` key must never parse as a
  // revision. Every consumer parses through here — the streamed line group fold used by the
  // compare, lines renewal and _fix (pushLineGroupKeys), and foldLatestLineAnchors/
  // latestLineAnchors, kept as reference oracles for tests — so all are sibling-blind by
  // construction (README.md invariant 5).
  if (last.endsWith(WHO_SUFFIX)) return undefined
  const dash = last.indexOf('-')
  if (dash === -1) return undefined
  const i = parseInt(last.slice(0, dash), 10)
  if (Number.isNaN(i)) return undefined
  const marker = last.slice(dash + 1)
  const lineId = decodeURIComponent(parts[parts.length - 2])
  if (marker === DELETED_MARKER) return { lineId, i, deleted: true }
  return { lineId, i, sha256: marker, deleted: false }
}

// Columns owned by the extension machinery. exprEval outputs (and remoteService `overwrite`
// columns) are plain non-underscore fields, but they are derived, rebuildable projections —
// recomputable from the covered inputs — and the extender writes them back OUTSIDE the
// transaction pipeline (unstamped), racing the relay: they must stay out of the covered body,
// exactly like `_ext_*` outputs and the ES projection. Mirrors writeExtendedStreams'
// patchedKeys (datasets/utils/rest.ts). Deliberately blind to `active`: a deactivated
// extension's column lingers on the lines, and both the relay and the checker must keep
// excluding it identically.
export const extensionOwnedKeys = (extensions?: Array<Record<string, any>>): Set<string> => {
  const keys = new Set<string>()
  for (const e of extensions ?? []) {
    if (e.type === 'exprEval' && e.property?.key) keys.add(e.property.key)
    if (e.type === 'remoteService') {
      if (e.propertyPrefix) keys.add(e.propertyPrefix)
      for (const key of Object.keys(e.overwrite ?? {})) {
        if (e.overwrite[key]?.['x-originalName']) keys.add(escapeKey(e.overwrite[key]['x-originalName']))
      }
    }
  }
  return keys
}

// the covered content of a line is its user-visible body: every `_`-prefixed field is internal
// (bookkeeping, CRC32 _hash, extension outputs `_ext_*` — rebuildable projections, and
// `_updatedBy`/`_updatedByName` — identities that must not enter the WORM store); extension-owned
// plain columns (see extensionOwnedKeys) are excluded for the same rebuildability reason
export const cleanedLineBody = (line: Record<string, any>, excludedKeys?: Set<string>): Record<string, any> => {
  const body: Record<string, any> = {}
  for (const key of Object.keys(line)) {
    if (!key.startsWith('_') && !excludedKeys?.has(key)) body[key] = line[key]
  }
  return body
}

export const lineSha256 = (line: Record<string, any>, excludedKeys?: Set<string>): string =>
  createHash('sha256').update(stableStringify(cleanedLineBody(line, excludedKeys))).digest('hex')

export type LatestLineAnchor = { key: string, i: number, sha256?: string, deleted: boolean }

// Incremental fold: merge one batch of keys into the latest-anchor map. Callers stream LIST
// pages through this so memory stays O(distinct lines), never O(total revisions).
export const foldLatestLineAnchors = (latest: Map<string, LatestLineAnchor>, keys: string[]): Map<string, LatestLineAnchor> => {
  for (const key of keys) {
    const parsed = parseLineRevisionKey(key)
    if (!parsed) continue
    const current = latest.get(parsed.lineId)
    if (!current || parsed.i > current.i) {
      latest.set(parsed.lineId, { key, i: parsed.i, sha256: parsed.sha256, deleted: parsed.deleted })
    }
  }
  return latest
}

export const latestLineAnchors = (keys: string[]): Map<string, LatestLineAnchor> =>
  foldLatestLineAnchors(new Map(), keys)

// A line's latest anchor, emitted once its whole key group has been seen (streamed compare).
export type LineAnchorGroup = LatestLineAnchor & { lineId: string, clean: boolean }
export type LineGroupFold = { open?: LineAnchorGroup }

export const newLineGroupFold = (): LineGroupFold => ({})

// Keys must arrive in listing order. Every key of a lineId shares the `lines/‹enc›/` prefix, so
// the group is contiguous in that order and complete as soon as a key of another lineId arrives —
// memory O(1) instead of O(distinct lines). Same latest-anchor rule as foldLatestLineAnchors
// (strict >: the lexically-first key wins an equal-i tie) and the same sibling blindness
// (parseLineRevisionKey drops `.who`).
export const pushLineGroupKeys = (acc: LineGroupFold, entries: Array<{ key: string, clean?: boolean }>): LineAnchorGroup[] => {
  const done: LineAnchorGroup[] = []
  for (const entry of entries) {
    const parsed = parseLineRevisionKey(entry.key)
    if (!parsed) continue
    if (acc.open && acc.open.lineId !== parsed.lineId) {
      done.push(acc.open)
      acc.open = undefined
    }
    if (!acc.open || parsed.i > acc.open.i) {
      acc.open = { lineId: parsed.lineId, key: entry.key, i: parsed.i, sha256: parsed.sha256, deleted: parsed.deleted, clean: entry.clean ?? true }
    }
  }
  return done
}

export const finishLineGroupFold = (acc: LineGroupFold): LineAnchorGroup[] => {
  const done = acc.open ? [acc.open] : []
  acc.open = undefined
  return done
}

export type LineVerdict = 'ok' | 'edited' | 'inserted'

// a live line against its latest anchor: no live anchor at all → out-of-band insert;
// content or _i divergence → out-of-band edit. (Anchored-but-vanished lines — out-of-band
// deletes — are the anchors left unvisited after the scan, handled by the caller.)
export const classifyLine = (line: { _i?: number } & Record<string, any>, anchor?: Pick<LatestLineAnchor, 'i' | 'sha256' | 'deleted'>, excludedKeys?: Set<string>): LineVerdict => {
  if (!anchor || anchor.deleted) return 'inserted'
  if (anchor.sha256 !== lineSha256(line, excludedKeys) || anchor.i !== line._i) return 'edited'
  return 'ok'
}

export type LiveLine = { _id: string, _i?: number } & Record<string, any>
// `lineI`: the live line's `_i` as compared (edited/inserted only). Repairs apply after the compare
// and skip a line whose live `_i` moved since — a legitimate write landed in between and anchored
// itself through the relay; overwriting/deleting it would undo that write.
export type LineDivergence = { lineId: string, kind: 'edited' | 'inserted' | 'missing', anchor?: { key: string, i: number }, lineI?: number }
export type LineCompareIO = {
  // live (non-_deleted) lines among `ids`
  lookupLive: (ids: string[]) => Promise<LiveLine[]>
  countLive: () => Promise<number>
  // true when a covered write hit the dataset since the compare began (the count is then untrustworthy)
  changedDuringCompare: () => Promise<boolean>
  iterateLiveIds: () => AsyncIterable<{ _id: string, _i?: number }>
}
export type LineCompareResult = { checked: number, diverged: number }

// 8 bytes of sha256, used to count accounted lines and to name inserted ones. A collision between
// two accounted ids makes `unaccounted` one too high (a spurious breach with nothing named), never
// a hidden one; a collision between an unaccounted and an accounted id leaves one insert unnamed
// while the count still reports it.
export const lineIdFingerprint = (lineId: string): bigint =>
  createHash('sha256').update(lineId).digest().readBigUInt64BE(0)

// growable typed array: ~8 bytes per accounted line instead of a Set of strings
class FingerprintSet {
  private values = new BigUint64Array(1024)
  private size = 0
  add (fp: bigint) {
    if (this.size === this.values.length) {
      const grown = new BigUint64Array(this.values.length * 2)
      grown.set(this.values)
      this.values = grown
    }
    this.values[this.size++] = fp
  }

  // sorts in place and removes duplicates: one synchronous sort per large check (~50 ms at 1M
  // lines), accepted
  seal (): void {
    const sorted = this.values.subarray(0, this.size).sort()
    let unique = 0
    for (let n = 0; n < sorted.length; n++) {
      if (n === 0 || sorted[n] !== sorted[unique - 1]) sorted[unique++] = sorted[n]
    }
    this.values = sorted.slice(0, unique)
    this.size = unique
  }

  sizeOf (): number { return this.size }

  has (fp: bigint): boolean {
    let lo = 0
    let hi = this.size - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const v = this.values[mid]
      if (v === fp) return true
      if (v < fp) lo = mid + 1
      else hi = mid - 1
    }
    return false
  }
}

// Streamed lines compare (design 2026-10-15 §3). Pass A: anchors arrive one per line (group
// fold), are looked up in Mongo in batches and classified with classifyLine — edited / inserted
// (tombstone latest) / missing. Pass B: `_id` is unique, so every live line holding an anchor is
// found exactly once in pass A — out-of-band inserts exist iff the live count exceeds the lines
// pass A found (counted DISTINCT: a forged non-canonical key can emit one lineId twice, and must
// not inflate the count to hide an insert). Only then are live ids streamed to name them.
// A covered write during the compare (changedDuringCompare) means the count cannot be trusted
// (a legitimate delete of an accounted line plus an out-of-band insert nets to zero), so the
// naming pass also runs then: it restores the old full-scan behavior, and the checker's
// pending-flag re-read then downgrades the verdict to 'unknown'.
export const createLineComparer = (io: LineCompareIO, opts: { onDiverged: (batch: LineDivergence[]) => Promise<void>, excluded?: Set<string>, batchSize?: number }) => {
  const batchSize = opts.batchSize ?? 1000
  const accounted = new FingerprintSet()
  let pending: LineAnchorGroup[] = []
  let diverged = 0

  const flush = async () => {
    if (!pending.length) return
    const groups = pending
    pending = []
    const live = new Map((await io.lookupLive(groups.map((g) => g.lineId))).map((l) => [l._id, l]))
    const batch: LineDivergence[] = []
    for (const g of groups) {
      const line = live.get(g.lineId)
      if (!line) {
        // a tombstone with no live line is a legitimately deleted line
        if (!g.deleted) batch.push({ lineId: g.lineId, kind: 'missing', anchor: { key: g.key, i: g.i } })
        continue
      }
      accounted.add(lineIdFingerprint(g.lineId))
      const verdict = classifyLine(line, g, opts.excluded)
      if (verdict !== 'ok') batch.push({ lineId: g.lineId, kind: verdict, anchor: { key: g.key, i: g.i }, lineI: line._i })
    }
    if (batch.length) {
      diverged += batch.length
      await opts.onDiverged(batch)
    }
  }

  return {
    push: async (group: LineAnchorGroup): Promise<void> => {
      pending.push(group)
      if (pending.length >= batchSize) await flush()
    },
    finish: async (): Promise<LineCompareResult> => {
      await flush()
      accounted.seal()
      const checked = await io.countLive()
      const unaccounted = checked - accounted.sizeOf()
      if (unaccounted > 0 || await io.changedDuringCompare()) {
        let named = 0
        let batch: LineDivergence[] = []
        for await (const live of io.iterateLiveIds()) {
          if (accounted.has(lineIdFingerprint(live._id))) continue
          named++
          batch.push({ lineId: live._id, kind: 'inserted', lineI: live._i })
          if (batch.length >= batchSize) { await opts.onDiverged(batch); batch = [] }
        }
        if (batch.length) await opts.onDiverged(batch)
        // the count stays exact if a fingerprint collision leaves one insert unnamed
        diverged += Math.max(unaccounted, named)
      }
      return { checked, diverged }
    }
  }
}
