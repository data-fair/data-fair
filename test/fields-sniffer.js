const sniffer = require('../server/utils/fields-sniffer')

const test = require('ava')

test('Work with booleans', t => {
  t.is(sniffer.sniff(['true', 'false']).type, 'boolean')
  t.is(sniffer.sniff(['true', 'False', '1', '-1', 'vrai', 'oui']).type, 'boolean')
  t.is(sniffer.sniff(['true', '']).type, 'boolean')
  t.is(sniffer.sniff(['true', 'yes it is']).type, 'string')
  t.is(sniffer.format('True', { type: 'boolean' }), true)
  t.is(sniffer.format('1', { type: 'boolean' }), true)
  t.is(sniffer.format('-1', { type: 'boolean' }), false)
  t.is(sniffer.format('vrai', { type: 'boolean' }), true)
  t.is(sniffer.format('faux', { type: 'boolean' }), false)
  t.is(sniffer.format('oui', { type: 'boolean' }), true)
  t.is(sniffer.format('non', { type: 'boolean' }), false)
  t.is(sniffer.format('yes', { type: 'boolean' }), true)
  t.is(sniffer.format('no', { type: 'boolean' }), false)
})

test('Work with numbers', t => {
  t.is(sniffer.sniff(['1.1', '2.2']).type, 'number')
  t.is(sniffer.sniff(['1', '22']).type, 'integer')
  t.is(sniffer.sniff(['1', '10 426']).type, 'integer')
  t.is(sniffer.sniff(['27 589']).type, 'integer') // I don't know what is that whitespace char, but it is not a simple space
  t.is(sniffer.sniff(['111', '-2.2']).type, 'number')
  t.is(sniffer.sniff(['1', '20 000.2']).type, 'number')
  t.is(sniffer.sniff(['10,10']).type, 'number')
  t.is(sniffer.format('-11', { type: 'number' }), -11)
  t.is(sniffer.format('-1', { type: 'integer' }), -1)
  t.is(sniffer.format('10 426', { type: 'integer' }), 10426)
  t.is(sniffer.format('20 000.2', { type: 'number' }), 20000.2)
  t.is(sniffer.format('27 589', { type: 'integer' }), 27589)
  t.is(sniffer.format('10,10', { type: 'number' }), 10.1)
  t.is(sniffer.sniff(['_0', '   10 426']).type, 'integer')
})

test('Work with dates', t => {
  t.deepEqual(sniffer.sniff([' 2017-11-29', '2017-12-12']), { type: 'string', format: 'date' })
  t.deepEqual(sniffer.sniff([' 2017-11-29T12:24:36.816Z ']), { type: 'string', format: 'date-time' })
})

test('Work with keywords and texts', t => {
  t.deepEqual(sniffer.sniff(['id1', 'id2']), { type: 'string', format: 'uri-reference' })
  t.deepEqual(sniffer.sniff(['id1', 'a text with whitespaces']), { type: 'string' })
})

test('Default type is string', t => {
  t.deepEqual(sniffer.sniff([]), { type: 'string' })
})
