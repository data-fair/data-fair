// @ts-nocheck -- standalone bench script, not api code; without this the root tsc
// (checkJs, no `benchmark` exclude) counts its untyped params against the type ratchet
// Worker body for scoring-placement.mjs variant E. Receives ONE transferred ArrayBuffer holding
// every candidate's raw BSON back to back, plus the offsets that delimit them — so nothing is
// structured-cloned and nothing is materialised as a JS object on the main thread.
//
// This is deliberately the exact boundary shape a Rust napi module would use (raw bytes in,
// top-N ids out), so that measuring it measures the ceiling of the Rust option too.

import { parentPort } from 'node:worker_threads'
import { createRequire } from 'node:module'
import path from 'node:path'

const { BSON } = await import('bson').catch(() => createRequire(path.join(process.cwd(), 'package.json'))('bson'))
const K1 = 1.2
const B = 0.75

parentPort.on('message', ({ arena, offsets, queryTerms, idfs, weights, avgLen }) => {
  const started = performance.now()
  const buf = Buffer.from(arena)
  const out = []
  for (let i = 0; i < offsets.length - 1; i++) {
    const d = BSON.deserialize(buf.subarray(offsets[i], offsets[i + 1]))
    let s = 0
    for (let k = 0; k < queryTerms.length; k++) {
      const t = queryTerms[k]
      const iv = idfs[k]
      for (const field in weights) {
        const tf = d._tf?.[field]?.[t]
        if (!tf) continue
        s += weights[field] * iv * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d._len?.[field] ?? 0) / avgLen[field]))
      }
    }
    out.push([d.slug, s])
  }
  out.sort((a, b) => b[1] - a[1])
  parentPort.postMessage({ top: out.slice(0, 20), workMs: performance.now() - started })
})
