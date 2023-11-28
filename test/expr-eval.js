const assert = require('assert').strict
const { parser } = require('../shared/expr-eval')

describe('expression engine based on expr-eval', () => {
  it('should evaluate simple expressions', () => {
    assert.equal(parser.parse('a + b').evaluate({ a: 1, b: 2 }), 3)
    assert.equal(parser.parse('UPPER(a)').evaluate({ a: 'a' }), 'A')
    assert.equal(parser.parse('REPLACE(a,"A","B")').evaluate({ a: 'aAa', b: 'B' }), 'aBa')
    assert.equal(parser.parse('REPLACE(a,"A\\u005C","B")').evaluate({ a: 'aA\\a', b: 'B' }), 'aBa')
  })
})
