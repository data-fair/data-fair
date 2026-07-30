const QUOTE = 0x22; const BACKSLASH = 0x5c; const OBRACE = 0x7b; const CBRACE = 0x7d; const OBRACKET = 0x5b; const CBRACKET = 0x5d
export interface HitSplitter { write(chunk: Buffer): void, end(): void, envelope(): any }

const isWs = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09

// Locate the byte just after the `[` of the REAL `"hits": [` — not a lookalike. Tracks JSON string context
// (so escaped-quote byte sequences inside keys/values never match) and brace/bracket depth (the inner hits
// key lives at brace-depth 2: root object → "hits" envelope object, outside any array). Returns -1 when the
// pattern is not (yet) complete in `b` — the caller re-scans once more bytes arrive (prefix is tiny).
function findHitsArrayStart (b: Buffer): number {
  let inStr = false; let esc = false; let depth = 0; let bracketDepth = 0; let strStart = -1
  for (let i = 0; i < b.length; i++) {
    const c = b[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === BACKSLASH) { esc = true; continue }
      if (c !== QUOTE) continue
      inStr = false
      // candidate: the exact 4-byte key `hits` at brace-depth 2, outside any array
      if (depth === 2 && bracketDepth === 0 && i - strStart === 5 &&
        b[strStart + 1] === 0x68 && b[strStart + 2] === 0x69 && b[strStart + 3] === 0x74 && b[strStart + 4] === 0x73) {
        let j = i + 1
        while (j < b.length && isWs(b[j])) j++
        if (j < b.length && b[j] === 0x3a) {
          j++
          while (j < b.length && isWs(b[j])) j++
          if (j < b.length && b[j] === OBRACKET) return j + 1
        }
      }
    } else if (c === QUOTE) { inStr = true; strStart = i } else if (c === OBRACE) depth++
    else if (c === CBRACE) depth--
    else if (c === OBRACKET) bracketDepth++
    else if (c === CBRACKET) bracketDepth--
  }
  return -1
}

export function createHitSplitter (onHit: (hitBytes: Buffer) => void): HitSplitter {
  let phase: 'prefix' | 'array' | 'tail' = 'prefix'
  let prefix: Buffer = Buffer.alloc(0)         // captured: start .. '[' inclusive
  const tail: Buffer[] = []                       // captured: ']' inclusive .. end
  let cur: Buffer = Buffer.alloc(0); let pos = 0
  let depth = 0; let inString = false; let escape = false; let hitStart = -1

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
    envelope () {
      try {
        return JSON.parse(Buffer.concat([prefix, ...tail]).toString())  // prefix ends '[', tail starts ']'
      } catch (err) {
        // fail loudly when the ES envelope-shape assumption breaks — a bare SyntaxError gives no hint that
        // the splitter mis-anchored or the response was not a JSON _search envelope at all
        throw new Error('hits-splitter: unexpected ES response envelope (prefix+tail does not parse)', { cause: err })
      }
    }
  }
}
