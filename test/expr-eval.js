const assert = require('assert').strict
const { parser } = require('../shared/expr-eval')

describe('expression engine based on expr-eval', () => {
  it('should evaluate simple expressions', () => {
    assert.equal(parser.parse('a + b').evaluate({ a: 1, b: 2 }), 3)
    assert.equal(parser.parse('UPPER(a)').evaluate({ a: 'a' }), 'A')
    assert.equal(parser.parse('REPLACE(a,"A","B")').evaluate({ a: 'aAa', b: 'B' }), 'aBa')
    assert.equal(parser.parse('REPLACE(a,"A\\u005C","B")').evaluate({ a: 'aA\\a', b: 'B' }), 'aBa')

    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: 'aAb' }), 1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: null }), -1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: true, a: 'aAb' }), -1)

    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: 'b' }), '86bfbbec238b3cb49c45ba78b02cd940')
    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: null }), '60921ff7863149ffa56c3947807e17e6')
  })
})
