import { createHash } from 'node:crypto'
import stableStringify from 'fast-json-stable-stringify'

// _i values (timestamp3 mode: hundredths of a second since dataset creation, plus a chunk
// discriminator) far exceed the joint anchor's 9-digit width — 16 digits keeps lexical
// order == numeric order for any realistic value
export const LINE_INDEX_WIDTH = 16
export const DELETED_MARKER = 'deleted'

export const padLineIndex = (i: number): string => String(i).padStart(LINE_INDEX_WIDTH, '0')

export const linesPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/lines/`

export const lineRevisionPrefix = (owner: { type: string, id: string }, datasetId: string, lineId: string): string =>
  `${linesPrefix(owner, datasetId)}${encodeURIComponent(lineId)}/`

// the sha256 (or the tombstone marker) is embedded in the key so the checker recovers every
// line's latest anchor hash from LIST alone — no per-object GETs
export const lineRevisionKey = (owner: { type: string, id: string }, datasetId: string, lineId: string, i: number, shaOrDeleted: string): string =>
  `${lineRevisionPrefix(owner, datasetId, lineId)}${padLineIndex(i)}-${shaOrDeleted}`

export type ParsedLineKey = { lineId: string, i: number, sha256?: string, deleted: boolean }

export const parseLineRevisionKey = (key: string): ParsedLineKey | undefined => {
  const parts = key.split('/')
  // …/‹datasetId›/lines/‹encodedLineId›/‹paddedI›-‹sha|deleted›
  if (parts.length < 3 || parts[parts.length - 3] !== 'lines') return undefined
  const last = parts[parts.length - 1]
  const dash = last.indexOf('-')
  if (dash === -1) return undefined
  const i = parseInt(last.slice(0, dash), 10)
  if (Number.isNaN(i)) return undefined
  const marker = last.slice(dash + 1)
  const lineId = decodeURIComponent(parts[parts.length - 2])
  if (marker === DELETED_MARKER) return { lineId, i, deleted: true }
  return { lineId, i, sha256: marker, deleted: false }
}

// the covered content of a line is its user-visible body: every `_`-prefixed field is internal
// (bookkeeping, CRC32 _hash, extension outputs `_ext_*` — rebuildable projections, and
// `_updatedBy`/`_updatedByName` — identities that must not enter the WORM store)
export const cleanedLineBody = (line: Record<string, any>): Record<string, any> => {
  const body: Record<string, any> = {}
  for (const key of Object.keys(line)) {
    if (!key.startsWith('_')) body[key] = line[key]
  }
  return body
}

export const lineSha256 = (line: Record<string, any>): string =>
  createHash('sha256').update(stableStringify(cleanedLineBody(line))).digest('hex')

export type LatestLineAnchor = { key: string, i: number, sha256?: string, deleted: boolean }

export const latestLineAnchors = (keys: string[]): Map<string, LatestLineAnchor> => {
  const latest = new Map<string, LatestLineAnchor>()
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

export type LineVerdict = 'ok' | 'edited' | 'inserted'

// a live line against its latest anchor: no live anchor at all → out-of-band insert;
// content or _i divergence → out-of-band edit. (Anchored-but-vanished lines — out-of-band
// deletes — are the anchors left unvisited after the scan, handled by the caller.)
export const classifyLine = (line: { _i?: number } & Record<string, any>, anchor?: Pick<LatestLineAnchor, 'i' | 'sha256' | 'deleted'>): LineVerdict => {
  if (!anchor || anchor.deleted) return 'inserted'
  if (anchor.sha256 !== lineSha256(line) || anchor.i !== line._i) return 'edited'
  return 'ok'
}
