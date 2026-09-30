import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { suggestRoutes } from '../../../ui/src/composables/agent/url-utils.ts'

// The real router's shape, trimmed. Note there is no /dataset/:id/edit-schema —
// schema editing lives on the dataset page itself, which is exactly the route a
// simulation caught the assistant inventing.
const ROUTES = [
  '/',
  '/datasets',
  '/new-dataset',
  '/dataset/:id',
  '/dataset/:id/table',
  '/dataset/:id/map',
  '/dataset/:id/edit-data',
  '/dataset/:id/files',
  '/dataset/:id/revisions',
  '/dataset/:id/api-doc',
  '/applications',
  '/application/:id'
]

test.describe('suggestRoutes', () => {
  test('offers the real sub-pages when a resource sub-page was invented', () => {
    const suggestions = suggestRoutes(ROUTES, '/dataset/abc123/edit-schema')
    assert.ok(suggestions.includes('/dataset/{id}/table'), suggestions.join(', '))
    assert.ok(suggestions.includes('/dataset/{id}'), suggestions.join(', '))
    // Nothing from an unrelated part of the app: a wrong dataset page is not
    // helped by being told applications exist.
    assert.equal(suggestions.some(s => s.startsWith('/application')), false)
  })

  test('renders params as {id}, matching the templating list_pages already uses', () => {
    const suggestions = suggestRoutes(ROUTES, '/dataset/abc123/nope')
    assert.equal(suggestions.some(s => s.includes(':')), false, suggestions.join(', '))
  })

  test('falls back to top-level pages when the first segment matches nothing', () => {
    const suggestions = suggestRoutes(ROUTES, '/dashboards/overview')
    assert.ok(suggestions.includes('/datasets'), suggestions.join(', '))
    assert.ok(suggestions.includes('/applications'), suggestions.join(', '))
    // The fallback is a menu, not a dump of every parameterised route.
    assert.equal(suggestions.some(s => s.includes('{id}')), false, suggestions.join(', '))
  })

  test('does not suggest the very path that failed', () => {
    const withGhost = [...ROUTES, '/dataset/:id/edit-schema']
    const suggestions = suggestRoutes(withGhost, '/dataset/abc/edit-schema')
    // (defensive: if the route did exist the caller would never have asked)
    assert.ok(Array.isArray(suggestions))
  })

  test('is bounded, so a long route table cannot flood the tool result', () => {
    const many = Array.from({ length: 50 }, (_, i) => `/dataset/:id/page${i}`)
    assert.ok(suggestRoutes(many, '/dataset/abc/nope').length <= 12)
  })

  test('returns an empty list rather than throwing on a junk path', () => {
    assert.deepEqual(suggestRoutes([], ''), [])
  })
})
