import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('Text formats', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Detect and parse text formats', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/text-formats.csv', ax)
    const shortProp = dataset.schema.find((p: any) => p.key === 'short')
    assert.equal(shortProp.type, 'string')
    assert.equal(shortProp['x-display'], undefined)
    assert.ok(!shortProp['x-capabilities'])
    const longProp = dataset.schema.find((p: any) => p.key === 'long')
    assert.equal(longProp.type, 'string')
    assert.equal(longProp['x-display'], 'textarea')
    assert.deepEqual(longProp['x-capabilities'], { index: false, values: false, insensitive: false })
  })
})
