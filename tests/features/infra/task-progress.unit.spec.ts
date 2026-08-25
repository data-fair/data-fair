import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// task-progress.ts imports `#mongo`, which loads (and validates) `#config`. The unit harness
// doesn't set NODE_CONFIG_DIR, so point node-config at the real api/config dir and load the
// modules by dynamic import afterwards — same pattern as lines-pipeline.unit.spec.ts.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// The progress bar of a dataset task is fed by inc() with FRACTIONAL increments: rest.ts sends
// 100/count per line, data-streams.ts sends (chunk.length / size) * 100 per byte range. Two
// independent defects used to leave a fully consumed stream displaying 99% forever:
//  - the 250ms websocket throttle swallowed the very last tick (the one that reaches 100 lands
//    microseconds after the previous one), and nothing rewrites the 100 afterwards because none
//    of the progress instances created inside the workers ever calls end() — only the outer one
//    in workers/index.ts does, once the whole task is already over
//  - summing fractional incs drifts: the total lands on 99.999999999998 about as often as on
//    100.000000000002, and a bare floor() turns the former into a permanent 99
// These tests pin both, by recording what task-progress publishes on the websocket channel —
// which is exactly what the UI progress bar renders.

// task-progress writes to mongo and to the ws-messages queue; both are faked here. wsEmitter
// keeps its collection in a module-level variable and init() is idempotent, hence the mutable
// sink that each test resets rather than a fresh init per test.
let sink: any[] = []
const fakeDb = {
  listCollections: () => ({ toArray: async () => [{ name: 'ws-messages' }] }),
  collection: () => ({
    insertOne: async (doc: any) => { if (doc.type === 'message') sink.push(doc.data) },
    updateOne: async () => {}
  })
}

const setup = async () => {
  const wsEmitter = await import('@data-fair/lib-node/ws-emitter.js')
  await wsEmitter.init(fakeDb as any)
  const mongo = (await import('../../../api/src/mongo.ts')).default
  ;(mongo as any).mongo = { db: fakeDb }
  const taskProgress = (await import('../../../api/src/datasets/utils/task-progress.ts')).default
  sink = []
  return { taskProgress, published: () => sink as { task: string, progress: number, step?: string, error?: boolean }[] }
}

test.describe('task progress', () => {
  test('reaches 100 even when the last tick lands inside the 250ms throttle window', async () => {
    const { taskProgress, published } = await setup()
    const progress = taskProgress('test-throttle', 'index', 100)
    // 1000 incs back to back: everything after the first publication falls inside the 250ms
    // throttle window, so 100 is the only other value allowed through
    for (let i = 0; i < 1000; i++) await progress.inc(100 / 1000)
    assert.equal(published().at(-1)?.progress, 100, `expected a final 100%, got ${JSON.stringify(published().at(-1))}`)
  })

  test('absorbs the float drift of fractional increments across stream shapes', async () => {
    // REST lines: inc = 100/count. 1000 and 9973 are counts whose sum undershoots 100 in IEEE 754
    for (const count of [3, 7, 1000, 9973, 100000]) {
      const { taskProgress, published } = await setup()
      const progress = taskProgress('test-drift-' + count, 'index', 100)
      for (let i = 0; i < count; i++) await progress.inc(100 / count)
      assert.equal(published().at(-1)?.progress, 100, `count=${count} should end at 100%, got ${JSON.stringify(published().at(-1))}`)
    }

    // file bytes: inc = (chunk / size) * 100, with an uneven trailing chunk
    for (const size of [8978432, 65536000, 123456789]) {
      const { taskProgress, published } = await setup()
      const progress = taskProgress('test-drift-bytes-' + size, 'index', 100)
      let read = 0
      while (read < size) {
        const chunk = Math.min(65536, size - read)
        read += chunk
        await progress.inc((chunk / size) * 100)
      }
      assert.equal(published().at(-1)?.progress, 100, `size=${size} should end at 100%, got ${JSON.stringify(published().at(-1))}`)
    }
  })

  test('does not flood the websocket once 100 is reached', async () => {
    const { taskProgress, published } = await setup()
    const progress = taskProgress('test-flood', 'index', 100)
    // 200 incs of 1 on a 100-step task: the bar tops out halfway and keeps being incremented
    for (let i = 0; i < 200; i++) await progress.inc(1)
    assert.equal(published().filter(p => p.progress === 100).length, 1)
  })

  test('step() hands the bar back to indeterminate with a named phase', async () => {
    const { taskProgress, published } = await setup()
    const progress = taskProgress('test-step', 'index', 100)
    for (let i = 0; i < 1000; i++) await progress.inc(100 / 1000)
    assert.equal(published().at(-1)?.progress, 100)

    await progress.step('refresh')
    assert.deepEqual(published().at(-1), { task: 'index', progress: -1, step: 'refresh' })
  })

  test('a failed task keeps the step so the UI shows which phase broke', async () => {
    const { taskProgress, published } = await setup()
    const progress = taskProgress('test-step-error', 'index', 100)
    await progress.step('checkConstraints')
    await progress.end(true)
    assert.equal(published().at(-1)?.step, 'checkConstraints')
    assert.equal(published().at(-1)?.error, true)
  })
})
