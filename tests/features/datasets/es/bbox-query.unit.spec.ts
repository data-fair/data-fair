import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// es/commons.ts imports `#config` at module load, so point node-config at the real api/config dir
// and load the module dynamically afterwards — same pattern as lines-pipeline.unit.spec.ts
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../../api/config')

const load = async () => await import('../../../../api/src/datasets/es/commons.ts')

// the bbox a map application sends when its bounds were never initialized
const maxValueBBOX = [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]
  .map(c => c.toFixed(6)).join(',')

test.describe('getQueryBBOX', () => {
  test('parses a valid bbox', async () => {
    const { getQueryBBOX } = await load()
    assert.deepEqual(getQueryBBOX({ bbox: '-1,44,3,49' }), [-1, 44, 3, 49])
    assert.deepEqual(getQueryBBOX({ _c_bbox: '-1,44,3,49' }), [-1, 44, 3, 49])
  })
  test('wraps the longitudes of a valid bbox', async () => {
    const { getQueryBBOX } = await load()
    assert.deepEqual(getQueryBBOX({ bbox: '-190,44,190,49' }), [170, 44, -170, 49])
  })
  test('converts a xyz tile reference', async () => {
    const { getQueryBBOX } = await load()
    const bbox = getQueryBBOX({ xyz: '1,1,2' })!
    assert.equal(bbox.length, 4)
    assert.ok(bbox.every(c => Number.isFinite(c)))
  })
  test('returns undefined without bbox nor xyz', async () => {
    const { getQueryBBOX } = await load()
    assert.equal(getQueryBBOX({}), undefined)
  })
  test('rejects a bbox with extreme values instead of hanging', async () => {
    const { getQueryBBOX } = await load()
    assert.throws(() => getQueryBBOX({ bbox: maxValueBBOX }), (err: any) => err.status === 400)
    assert.throws(() => getQueryBBOX({ _c_bbox: maxValueBBOX }), (err: any) => err.status === 400)
  })
  test('rejects a non numeric bbox', async () => {
    const { getQueryBBOX } = await load()
    assert.throws(() => getQueryBBOX({ bbox: 'a,b,c,d' }), (err: any) => err.status === 400)
  })
  test('rejects a bbox with a wrong number of coordinates', async () => {
    const { getQueryBBOX } = await load()
    assert.throws(() => getQueryBBOX({ bbox: '-1,44,3' }), (err: any) => err.status === 400)
  })
  test('rejects out of range latitudes', async () => {
    const { getQueryBBOX } = await load()
    assert.throws(() => getQueryBBOX({ bbox: '-1,-91,3,49' }), (err: any) => err.status === 400)
    assert.throws(() => getQueryBBOX({ bbox: '-1,44,3,91' }), (err: any) => err.status === 400)
  })
  test('rejects a xyz reference producing invalid coordinates', async () => {
    const { getQueryBBOX } = await load()
    assert.throws(() => getQueryBBOX({ xyz: '1e300,0,-1000' }), (err: any) => err.status === 400)
  })
})
