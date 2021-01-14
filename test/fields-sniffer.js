const assert = require('assert').strict
const sniffer = require('../server/utils/fields-sniffer')

describe('field sniffer', () => {
  it('Work with booleans', () => {
    assert.equal(sniffer.sniff(['true', 'false']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'False', '1', '-1', 'vrai', 'oui']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', '']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'yes it is']).type, 'string')
    assert.equal(sniffer.format('True', { type: 'boolean' }), true)
    assert.equal(sniffer.format('1', { type: 'boolean' }), true)
    assert.equal(sniffer.format('-1', { type: 'boolean' }), false)
    assert.equal(sniffer.format('vrai', { type: 'boolean' }), true)
    assert.equal(sniffer.format('faux', { type: 'boolean' }), false)
    assert.equal(sniffer.format('oui', { type: 'boolean' }), true)
    assert.equal(sniffer.format('non', { type: 'boolean' }), false)
    assert.equal(sniffer.format('yes', { type: 'boolean' }), true)
    assert.equal(sniffer.format('no', { type: 'boolean' }), false)
  })

  it('Work with numbers', () => {
    assert.equal(sniffer.sniff(['1.1', '2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '22']).type, 'integer')
    assert.equal(sniffer.sniff(['1', '10 426']).type, 'integer')
    assert.equal(sniffer.sniff(['27 589']).type, 'integer') // I don't know what is that whitespace char, but it is not a simple space
    assert.equal(sniffer.sniff(['111', '-2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '20 000.2']).type, 'number')
    assert.equal(sniffer.sniff(['10,10']).type, 'number')
    assert.equal(sniffer.format('-11', { type: 'number' }), -11)
    assert.equal(sniffer.format('-1', { type: 'integer' }), -1)
    assert.equal(sniffer.format('10 426', { type: 'integer' }), 10426)
    assert.equal(sniffer.format('20 000.2', { type: 'number' }), 20000.2)
    assert.equal(sniffer.format('27 589', { type: 'integer' }), 27589)
    assert.equal(sniffer.format('10,10', { type: 'number' }), 10.1)
    assert.equal(sniffer.sniff(['_0', '   10 426']).type, 'integer')
  })

  it('Work with dates', () => {
    assert.deepEqual(sniffer.sniff([' 2017-11-29', '2017-12-12']), { type: 'string', format: 'date' })
    assert.deepEqual(sniffer.sniff([' 2017-11-29T12:24:36.816Z ']), { type: 'string', format: 'date-time' })
  })

  it('Work with keywords and texts', () => {
    assert.deepEqual(sniffer.sniff(['id1', 'id2']), { type: 'string', format: 'uri-reference' })
    assert.deepEqual(sniffer.sniff(['id1', 'a text with whitespaces']), { type: 'string' })
  })

  it('Default type is string', () => {
    assert.deepEqual(sniffer.sniff([]), { type: 'string' })
  })
})
