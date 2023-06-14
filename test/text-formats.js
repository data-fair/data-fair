const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Text formats', () => {
  it('Detect and parse text formats', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/text-formats.csv', ax)
    const shortProp = dataset.schema.find(p => p.key === 'short')
    assert.equal(shortProp.type, 'string')
    assert.equal(shortProp['x-display'], undefined)
    assert.ok(!shortProp['x-capabilities'])
    const longProp = dataset.schema.find(p => p.key === 'long')
    assert.equal(longProp.type, 'string')
    assert.equal(longProp['x-display'], 'textarea')
    assert.deepEqual(longProp['x-capabilities'], { index: false, values: false, insensitive: false })
  })
})
