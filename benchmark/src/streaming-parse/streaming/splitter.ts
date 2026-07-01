export interface HitSplitter { write(chunk: Buffer): void, end(): void, total: number | null }

// bytes
const QUOTE = 0x22; const BACKSLASH = 0x5c; const OBRACE = 0x7b; const CBRACE = 0x7d; const CBRACKET = 0x5d

// Find the index just AFTER the hits-array '[' in the accumulated prefix. Returns -1 if not yet seen.
// ES envelope: the only `"hits":[` before any hit data is the real hits array (took/_shards/total
// don't contain it). We match the byte sequence `"hits"` <ws>* `:` <ws>* `[`.
function findHitsArrayStart (b: Buffer): number {
  const needle = Buffer.from('"hits"')
  let from = 0
  for (;;) {
    const idx = b.indexOf(needle, from)
    if (idx === -1) return -1
    let j = idx + needle.length
    while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
    if (j < b.length && b[j] === 0x3a /* : */) {
      j++
      while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
      if (j < b.length && b[j] === 0x5b /* [ */) return j + 1
      // `"hits":{...}` (the outer hits object) — keep scanning for the inner `"hits":[`
    }
    from = idx + needle.length
  }
}
function extractTotal (b: Buffer): number | null {
  const s = b.toString('latin1')
  let m = /"total"\s*:\s*\{\s*"value"\s*:\s*(\d+)/.exec(s)
  if (m) return Number(m[1])
  m = /"total"\s*:\s*(\d+)/.exec(s)
  return m ? Number(m[1]) : null
}

export function createHitSplitter (onHit: (hitBytes: Buffer) => void): HitSplitter {
  let phase: 'prefix' | 'array' | 'done' = 'prefix'
  let prefix: Buffer = Buffer.alloc(0)
  let total: number | null = null
  let cur: Buffer = Buffer.alloc(0)   // unconsumed array-phase bytes
  let pos = 0                         // scan cursor within cur
  let depth = 0
  let inString = false
  let escape = false
  let hitStart = -1                   // index in cur where the in-progress hit began, or -1

  const scanArray = (chunk: Buffer) => {
    cur = cur.length ? Buffer.concat([cur, chunk]) : chunk
    let lastEmitEnd = 0
    while (pos < cur.length) {
      const c = cur[pos]
      if (inString) {
        if (escape) escape = false
        else if (c === BACKSLASH) escape = true
        else if (c === QUOTE) inString = false
      } else if (c === QUOTE) inString = true
      else if (c === OBRACE) { if (depth === 0) hitStart = pos; depth++ } else if (c === CBRACE) { depth--; if (depth === 0) { onHit(cur.subarray(hitStart, pos + 1)); lastEmitEnd = pos + 1; hitStart = -1 } } else if (c === CBRACKET && depth === 0) { phase = 'done'; break }
      pos++
    }
    // compact: keep from the in-progress hit start, else drop everything consumed
    const keepFrom = hitStart >= 0 ? hitStart : lastEmitEnd
    if (keepFrom > 0) { cur = cur.subarray(keepFrom); pos -= keepFrom; if (hitStart >= 0) hitStart -= keepFrom }
  }

  return {
    get total () { return total },
    write (chunk: Buffer) {
      if (phase === 'done') return
      if (phase === 'prefix') {
        prefix = prefix.length ? Buffer.concat([prefix, chunk]) : chunk
        const start = findHitsArrayStart(prefix)
        if (start === -1) return
        total = extractTotal(prefix)
        const rest = prefix.subarray(start)
        prefix = Buffer.alloc(0)
        phase = 'array'
        scanArray(rest)
        return
      }
      scanArray(chunk)
    },
    end () { phase = 'done' }
  }
}
