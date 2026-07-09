// Micro-benchmark: peak external memory of the /lines assemble-then-send tail.
//
// Legacy shape: BodyAccumulator.finish() ended with Buffer.concat([prefix, ...parts, suffix]) and the
// whole contiguous buffer was pinned by res.end for the entire (possibly throttled) send — at the
// concat instant the ~64KB parts AND the copy are both live (~2× body external), then ~1× until the
// last byte reaches the client.
//
// Sequential shape (implemented): finish() returns the parts unjoined; sendPreparedParts →
// res.endParts writes them one by one under backpressure and shifts each part out of the array once
// accepted — peak stays ~1× and the retained set DECREASES during the send.
//
// This bench reproduces both retained-set shapes with the send loop stubbed (the socket doesn't
// matter, the live-buffer graph does) and samples post-GC external memory at each phase.
//
// Run from the repo root:
//   node --experimental-strip-types --expose-gc --disable-warning=ExperimentalWarning \
//     benchmark/src/micro/body-parts-send.bench.ts

if (typeof global.gc !== 'function') {
  console.error('re-run with --expose-gc (post-GC sampling is the whole point of this bench)')
  process.exit(1)
}

const PART_SIZE = 64 * 1024
const BODY_BYTES = 128 * 1024 * 1024 // a large /lines export
const PART_COUNT = BODY_BYTES / PART_SIZE

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)}MB`
const externalNow = () => { global.gc!(); return process.memoryUsage().external }

const makeParts = () => {
  const parts: Buffer[] = []
  for (let i = 0; i < PART_COUNT; i++) parts.push(Buffer.allocUnsafe(PART_SIZE).fill(65))
  return parts
}

// drip `sliceSize` bytes per iteration, sampling external at every ~1/8 of the body
const sampledDrip = (label: string, baseline: number, next: () => number, totalSteps: number) => {
  const samples: number[] = []
  const every = Math.max(1, Math.floor(totalSteps / 8))
  for (let step = 0; step < totalSteps; step++) {
    next()
    if (step % every === every - 1) samples.push(externalNow() - baseline)
  }
  console.log(`${label.padEnd(46)} during send: ${samples.map(mb).join(' → ')}`)
  return samples
}

console.log(`body: ${mb(BODY_BYTES)} as ${PART_COUNT} x ${PART_SIZE / 1024}KB parts\n`)

// ---------- A. legacy: Buffer.concat + pinned single buffer ----------
{
  const baseline = externalNow()
  let parts: Buffer[] | null = makeParts()
  const assembled = externalNow() - baseline
  const buffer = Buffer.concat(parts)
  const atConcat = process.memoryUsage().external - baseline // parts + copy live at this instant
  parts = null // what res.send-time GC could reclaim at best
  const pinned = externalNow() - baseline
  console.log('--- A. legacy concat + res.end(buffer) ---')
  console.log(`assembled parts: ${mb(assembled)}   at Buffer.concat: ${mb(atConcat)} (the 2x transient)   pinned for the send: ${mb(pinned)}`)
  // the single buffer is pinned whole until the last slice is written
  let pos = 0
  sampledDrip('drip 64KB slices of the pinned buffer', baseline, () => (pos += PART_SIZE), PART_COUNT)
  // keep `buffer` alive to the end of the send like res.end does
  if (buffer.length !== BODY_BYTES) throw new Error('unreachable')
}

// ---------- B. sequential parts write with progressive release ----------
{
  const baseline = externalNow()
  const parts = makeParts()
  const assembled = externalNow() - baseline
  console.log('\n--- B. sequential write + parts.shift() (implemented) ---')
  console.log(`assembled parts: ${mb(assembled)}   no concat: peak stays ~1x`)
  sampledDrip('drip parts, shifting each once accepted', baseline, () => { parts.shift(); return parts.length }, PART_COUNT)
}
