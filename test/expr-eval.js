const assert = require('assert').strict
const { parser, compile } = require('../shared/expr-eval')('Europe/Paris')

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
    assert.equal(parser.parse('JOIN(SPLIT(a, "-"), "_")').evaluate({ a: 'a-b-c' }), 'a_b_c')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "DD/MM/YYYY")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), '07/05/2024')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY")').evaluate({ a: '07/05/2024' }), '2024-05-07T00:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY", "", "America/Toronto")').evaluate({ a: '07/05/2024' }), '2024-05-07T06:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "X")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "x")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817000)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: 1715076817 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "x")').evaluate({ a: 1715076817000 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: '1715076817' }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: null }), null)

    assert.equal(compile('a', { type: 'string' })({ a: 11 }), '11')
    assert.equal(compile('a', { type: 'number' })({ a: '11' }), 11)
    assert.equal(compile('CONCAT(a,";",a)', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'string', format: 'date', separator: ';' })({ a: '2024-11-11' }), '2024-11-11;2024-11-11')
    assert.throws(() => compile('a', { key: 'e', type: 'string', format: 'date' })({ a: '11' }), { message: '/e doit correspondre au format "date" (date) (résultat : "11")' })
    assert.equal(compile('a', { type: 'string' })({ a: null }), null)
    assert.throws(() => compile('a', { key: 'e', type: 'string', 'x-required': true })({ a: null }), { message: 'requiert la propriété e (e) (résultat : null)' })
  })
})
