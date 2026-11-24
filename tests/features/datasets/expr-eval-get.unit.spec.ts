import { test } from '@playwright/test'
import assert from 'node:assert/strict'
// @ts-ignore -- shared module
import exprEvalFactory from '../../../shared/expr-eval.js'

const { parser } = exprEvalFactory('Europe/Paris')
const evaluate = (expr: string, data: Record<string, any>) => parser.parse(expr).evaluate(data)

test.describe('expr-eval GET', () => {
  test('reads properties and array items, with a default', () => {
    assert.equal(evaluate('GET(JSON_PARSE(v), "a")', { v: '{"a":1}' }), 1)
    assert.equal(evaluate('GET(JSON_PARSE(v), 1)', { v: '[1,2]' }), 2)
    assert.equal(evaluate('GET(JSON_PARSE(v), "b", "x")', { v: '{"a":1}' }), 'x')
  })

  test('only reads own properties', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(evaluate(`GET(JSON_PARSE(v), "${key}", "x")`, { v: '{"a":1}' }), 'x')
    }
  })

  test('passes null and scalars through', () => {
    assert.equal(evaluate('GET(JSON_PARSE(v), "a")', { v: 'null' }), null)
    assert.equal(evaluate('GET(v, "a")', { v: 3 }), 3)
  })
})
