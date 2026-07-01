const QUOTE = 0x22; const BACKSLASH = 0x5c; const OBRACE = 0x7b; const CBRACE = 0x7d; const CBRACKET = 0x5d
export interface HitSplitter { write(chunk: Buffer): void, end(): void, envelope(): any, total(): number | undefined }

function findHitsArrayStart (b: Buffer): number {
  const needle = Buffer.from('"hits"'); let from = 0
  for (;;) {
    const idx = b.indexOf(needle, from); if (idx === -1) return -1
    let j = idx + needle.length
    while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
    if (j < b.length && b[j] === 0x3a) { j++; while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++; if (j < b.length && b[j] === 0x5b) return j + 1 }
    from = idx + needle.length
  }
}

export function createHitSplitter (onHit: (hitBytes: Buffer) => void): HitSplitter {
  let phase: 'prefix' | 'array' | 'tail' = 'prefix'
  let prefix: Buffer = Buffer.alloc(0)         // captured: start .. '[' inclusive
  const tail: Buffer[] = []                       // captured: ']' inclusive .. end
  let cur: Buffer = Buffer.alloc(0); let pos = 0
  let depth = 0; let inString = false; let escape = false; let hitStart = -1
  let totalCache: number | undefined; let totalComputed = false

  const scanArray = (chunk: Buffer) => {
    cur = cur.length ? Buffer.concat([cur, chunk]) : chunk
    let lastEmitEnd = 0
    while (pos < cur.length) {
      const c = cur[pos]
      if (inString) { if (escape) escape = false; else if (c === BACKSLASH) escape = true; else if (c === QUOTE) inString = false } else if (c === QUOTE) inString = true
      else if (c === OBRACE) { if (depth === 0) hitStart = pos; depth++ } else if (c === CBRACE) { depth--; if (depth === 0) { onHit(cur.subarray(hitStart, pos + 1)); lastEmitEnd = pos + 1; hitStart = -1 } } else if (c === CBRACKET && depth === 0) { phase = 'tail'; tail.push(cur.subarray(pos)); return }
      pos++
    }
    const keepFrom = hitStart >= 0 ? hitStart : lastEmitEnd
    if (keepFrom > 0) { cur = cur.subarray(keepFrom); pos -= keepFrom; if (hitStart >= 0) hitStart -= keepFrom }
  }

  return {
    write (chunk: Buffer) {
      if (phase === 'tail') { tail.push(chunk); return }
      if (phase === 'prefix') {
        prefix = prefix.length ? Buffer.concat([prefix, chunk]) : chunk
        const start = findHitsArrayStart(prefix); if (start === -1) return
        const rest = prefix.subarray(start); prefix = prefix.subarray(0, start)  // keep through '['
        phase = 'array'; scanArray(rest); return
      }
      scanArray(chunk)
    },
    end () { if (phase === 'prefix') phase = 'tail' },
    // total is available as soon as the hits-array prefix is captured (phase left 'prefix'): the prefix
    // ends '...:[' so we close the open array (']') and every still-open object ('}' × brace-depth) to
    // recover a valid head envelope with an empty hits array, then read hits.total.value from it. This
    // lets the streamed source expose `total` BEFORE any hit is iterated (matches the /lines write order).
    total () {
      if (totalComputed) return totalCache
      if (phase === 'prefix') return undefined // hits array not reached yet
      let d = 0; let inStr = false; let esc = false
      for (let i = 0; i < prefix.length; i++) {
        const c = prefix[i]
        if (inStr) { if (esc) esc = false; else if (c === BACKSLASH) esc = true; else if (c === QUOTE) inStr = false } else if (c === QUOTE) inStr = true
        else if (c === OBRACE) d++; else if (c === CBRACE) d--
      }
      const head = JSON.parse(Buffer.concat([prefix, Buffer.from(']' + '}'.repeat(d))]).toString())
      totalCache = head?.hits?.total?.value
      totalComputed = true
      return totalCache
    },
    envelope () { return JSON.parse(Buffer.concat([prefix, ...tail]).toString()) }  // prefix ends '[', tail starts ']'
  }
}
