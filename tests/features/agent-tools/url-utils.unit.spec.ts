import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { toAbsoluteUrl, toRoutePath } from '../../../ui/src/composables/agent/url-utils.ts'

const ORIGIN = 'https://koumoul.com'

test.describe('toAbsoluteUrl', () => {
  test('prefixes origin + base to a router path', () => {
    assert.equal(toAbsoluteUrl(ORIGIN, '/data-fair/', '/dataset/abc/table'), 'https://koumoul.com/data-fair/dataset/abc/table')
  })

  test('keeps {id} templates intact (no URL parsing/encoding)', () => {
    assert.equal(toAbsoluteUrl(ORIGIN, '/data-fair/', '/dataset/{id}'), 'https://koumoul.com/data-fair/dataset/{id}')
  })

  test('handles a base with an upstream site path', () => {
    assert.equal(toAbsoluteUrl(ORIGIN, '/data/data-fair/', '/datasets'), 'https://koumoul.com/data/data-fair/datasets')
  })

  test('handles a root base', () => {
    assert.equal(toAbsoluteUrl(ORIGIN, '/', '/datasets'), 'https://koumoul.com/datasets')
  })

  test('adds a missing leading slash to the path', () => {
    assert.equal(toAbsoluteUrl(ORIGIN, '/data-fair/', 'datasets'), 'https://koumoul.com/data-fair/datasets')
  })
})

test.describe('toRoutePath', () => {
  test('strips origin + base from a full absolute URL', () => {
    assert.deepEqual(toRoutePath(ORIGIN, '/data-fair/', 'https://koumoul.com/data-fair/dataset/abc/table'), { path: '/dataset/abc/table', query: undefined })
  })

  test('preserves the embedded query string', () => {
    assert.deepEqual(
      toRoutePath(ORIGIN, '/data-fair/', 'https://koumoul.com/data-fair/dataset/abc/table?ville_eq=Paris&_c_q=foo'),
      { path: '/dataset/abc/table', query: 'ville_eq=Paris&_c_q=foo' }
    )
  })

  test('strips the base from a base-prefixed path', () => {
    assert.deepEqual(toRoutePath(ORIGIN, '/data-fair/', '/data-fair/dataset/abc'), { path: '/dataset/abc', query: undefined })
  })

  test('leaves a bare base-less router path unchanged (backward compat)', () => {
    assert.deepEqual(toRoutePath(ORIGIN, '/data-fair/', '/dataset/abc'), { path: '/dataset/abc', query: undefined })
  })

  test('recovers the path from a wrong/hallucinated origin', () => {
    assert.deepEqual(toRoutePath(ORIGIN, '/data-fair/', 'https://data-fair.koumoul.com/dataset/abc'), { path: '/dataset/abc', query: undefined })
  })

  test('maps the base root to "/"', () => {
    assert.deepEqual(toRoutePath(ORIGIN, '/data-fair/', 'https://koumoul.com/data-fair'), { path: '/', query: undefined })
  })
})
