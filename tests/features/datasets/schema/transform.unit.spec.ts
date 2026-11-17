import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import exprEval from '../../../../shared/expr-eval.js'

const { parser, compile } = exprEval('Europe/Paris')

test.describe('expression evaluation unit tests', () => {
  test('should evaluate simple expressions', () => {
    assert.equal(parser.parse('a + b').evaluate({ a: 1, b: 2 }), 3)
    assert.equal(parser.parse('UPPER(a)').evaluate({ a: 'a' }), 'A')
    assert.equal(parser.parse('LOWER(a)').evaluate({ a: 'A' }), 'a')
    assert.equal(parser.parse('REPLACE(a,"A",b)').evaluate({ a: 'aAa', b: 'B' }), 'aBa')
    assert.equal(parser.parse('REPLACE(a,"A",b)').evaluate({ a: 'aAaAa', b: 'BA' }), 'aBAaBAa')
    assert.equal(parser.parse('REPLACE(a,"A\\u005C","B")').evaluate({ a: 'aA\\a', b: 'B' }), 'aBa')
    assert.equal(parser.parse('TITLE(a)').evaluate({ a: 'my title' }), 'My Title')
    assert.equal(parser.parse('PHRASE(a)').evaluate({ a: 'my phrase' }), 'My phrase')
    assert.equal(parser.parse('PAD_RIGHT(a, 5, "-")').evaluate({ a: 'ABC' }), 'ABC--')
    assert.equal(parser.parse('PAD_LEFT(a, 5, "-")').evaluate({ a: 'ABC' }), '--ABC')
    assert.equal(parser.parse('SLUG(a)').evaluate({ a: 'My title' }), 'my-title')
    assert.equal(parser.parse('SLUG(a, "_")').evaluate({ a: 'My title' }), 'my_title')

    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop")').evaluate({ a: '{"prop": "My prop"}' }), 'My prop')
    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop2")').evaluate({ a: '{"prop": "My prop"}' }), undefined)
    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop2")').evaluate({ a: '' }), undefined)

    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: 'aAb' }), 1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: null } as any), -1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: true, a: 'aAb' } as any), -1)

    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: 'b' }), '86bfbbec238b3cb49c45ba78b02cd940')
    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: null } as any), '60921ff7863149ffa56c3947807e17e6')
    assert.equal(parser.parse('JOIN(SPLIT(a, "-"), "_")').evaluate({ a: 'a-b-c' }), 'a_b_c')
    assert.equal(parser.parse('JOIN(SPLIT(a, "-"), "\n")').evaluate({ a: 'a-b-c' }), `a
b
c`)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "DD/MM/YYYY")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), '07/05/2024')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY")').evaluate({ a: '07/05/2024' }), '2024-05-07T00:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY", "", "America/Toronto")').evaluate({ a: '07/05/2024' }), '2024-05-07T06:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "X")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "x")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817000)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: 1715076817 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "x")').evaluate({ a: 1715076817000 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: '1715076817' }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: null } as any), null)
    assert.equal(parser.parse('join("-", filter(f(item) = item, [a, b, c]))').evaluate({ a: 'a', b: '', c: 'c' }), 'a-c')
    assert.equal(parser.parse('join("-", filter(TRUTHY, [a, b, c]))').evaluate({ a: 'a', b: '', c: 'c' }), 'a-c')
    assert.equal(parser.parse('join("-", filter(DEFINED, [a, b, c]))').evaluate({ a: true, b: null, c: false } as any), 'true-false')
    assert.equal(parser.parse('NO_VALUE()').evaluate({}), undefined)

    assert.equal(parser.parse('EXTRACT(a, "<", ">")').evaluate({ a: 'Hello <world>' }), 'world')
    assert.equal(parser.parse('EXTRACT(a, "statut: ", "\n")').evaluate({
      a: `statut: test
bla bla`
    }), 'test')

    assert.equal(compile('a', { type: 'string' })({ a: 11 }), '11')
    assert.equal(compile('a', { type: 'number' })({ a: '11' }), 11)
    assert.equal(compile('CONCAT(a,";",a)', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'string', format: 'date', separator: ';' })({ a: '2024-11-11' }), '2024-11-11;2024-11-11')
    assert.equal(compile('a', { type: 'string', format: 'date-time' })({ a: '1961-02-13 00:00:00+00:00' }), '1961-02-13T00:00:00+00:00')
    assert.throws(() => compile('a', { key: 'e', type: 'string', format: 'date' })({ a: '11' }), { message: '/e doit correspondre au format "date" (date) (résultat : "11")' })
    assert.equal(compile('a', { type: 'string' })({ a: null }), null)
    assert.throws(() => compile('a', { key: 'e', type: 'string', 'x-required': true })({ a: null }), { message: 'requiert la propriété e (e) (résultat : null)' })

    assert.equal(compile('a', { type: 'number' })({ a: '' }), null)
    assert.equal(compile('a', { type: 'integer' })({ a: '  ' }), null)
    assert.equal(compile('a', { type: 'boolean' })({ a: '' }), null)
    assert.equal(compile('a', { type: 'string' })({ a: '' }), null)
    assert.equal(compile('a', { type: 'string', format: 'date-time' })({ a: '' }), null)
    assert.equal(compile('CONCAT(a, b)', { type: 'number' })({ a: '', b: '' }), null)
    assert.equal(compile('CONCAT(a,";",b)', { type: 'number', separator: ';' })({ a: '11', b: '' }), '11')
    assert.equal(compile('[a,b]', { type: 'number', separator: ';' })({ a: '', b: '' }), null)
    assert.equal(compile('a ? NO_VALUE() : nb', { type: 'number' })({ a: true, nb: 1 }), null)
    assert.equal(compile('a ? NO_VALUE() : nb', { type: 'string' })({ a: true, nb: 1 }), null)
  })

  test('should allow several locally defined functions in one expression', () => {
    // a function defined in the expression stays callable after another one is defined
    assert.equal(parser.parse('f(x) = x + 1; g(y) = y * 2; f(a)').evaluate({ a: 1 }), 2)
    // and can be called, or passed to fold/map, from the body of another local function
    assert.equal(parser.parse('f(x) = x + 1; g(y) = f(y) * 2; g(a)').evaluate({ a: 1 }), 4)
    assert.equal(parser.parse('inc(x) = x + 1; incAll(l) = map(inc, l); JOIN(incAll(SPLIT(a, ",")), ",")').evaluate({ a: '1,2' }), '2,3')

    // keep the last word of a column when it contains a digit
    const keepLastNumberedWord = compile(
      'digit(acc, c) = acc or (c >= "0" and c <= "9"); keep(g) = fold(digit, false, SPLIT(g, "")) ? g : ""; ' +
      'keep(GET(SPLIT(a, " "), (length SPLIT(a, " ")) - 1))',
      { key: 'out', type: 'string' }
    )
    assert.equal(keepLastNumberedWord({ a: 'DUPONT Jean 123456' }), '123456')
    assert.equal(keepLastNumberedWord({ a: 'DUPONT Jean' }), null)
    // the definitions of one row do not prevent the next row from evaluating
    assert.equal(keepLastNumberedWord({ a: 'MARTIN 42' }), '42')

    // a defined function is not registered in the parser-wide functions, where any later
    // expression could reach it (it used to be stored under 'lambda_NaN')
    assert.deepEqual(Object.keys(parser.functions).filter(k => k.startsWith('lambda_') || k === '__counter'), [])
    assert.throws(() => parser.parse('lambda_NaN(1)').evaluate({}), { message: 'undefined variable: lambda_NaN' })
  })
})
