/**
 * list_datasets promises "id, title, status, row count, and last update" in its
 * own description, and then never asked the API for two of them — so every call
 * rendered `Status: unknown` and `updated ?`, for finalized datasets the UI was
 * showing as up to date on the same screen.
 *
 * Three judged runs flagged it, and one traced the cost: a model reading
 * "unknown / updated ?" has reason to spend an extra describe_dataset round trip
 * confirming the dataset is usable, which is exactly what it did.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildQuery, formatResult } from '../../../agent-tools/list-datasets.ts'

test.describe('buildQuery asks for what the tool promises', () => {
  test('selects the fields the description advertises', () => {
    const select = buildQuery({}).query.select.split(',')
    for (const field of ['id', 'title', 'status', 'count', 'updatedAt']) {
      assert.ok(select.includes(field), `missing from select: ${field}`)
    }
  })

  test('still carries the search term and paging', () => {
    const { query, path } = buildQuery({ q: 'élus', page: 2, size: 5 })
    assert.equal(query.q, 'élus')
    assert.equal(query.page, '2')
    assert.equal(query.size, '5')
    assert.equal(path, 'datasets')
  })
})

test.describe('formatResult reports what the API returned', () => {
  const dataset = {
    id: 'equipements',
    title: 'Équipements sportifs',
    status: 'finalized',
    count: 40,
    updatedAt: '2026-09-17T08:12:00.000Z',
    page: 'https://example.org/data-fair/dataset/equipements'
  }

  test('prints the real status, row count and update date', () => {
    const { text } = formatResult({ count: 1, results: [dataset] }, 1, 10)
    assert.ok(text.includes('finalized'), text)
    assert.ok(text.includes('40 rows'), text)
    assert.ok(!text.includes('Status: unknown'), 'a finalized dataset must not read as unknown')
    assert.ok(!text.includes('updated ?'), 'an updated dataset must not read as ?')
  })

  test('says nothing rather than inventing a placeholder when a field is genuinely absent', () => {
    // A dataset mid-creation has no row count yet. Printing "unknown" and "?"
    // states something false; leaving the field out states nothing.
    const { text } = formatResult({ count: 1, results: [{ id: 'new', title: 'Tout neuf' }] }, 1, 10)
    assert.ok(!text.includes('unknown'), text)
    assert.ok(!text.includes('?'), text)
    assert.ok(text.includes('Tout neuf'), text)
  })

  test('keeps the id, slug and absolute link a caller needs', () => {
    const { text, structuredContent } = formatResult({ count: 1, results: [{ ...dataset, slug: 'equipements-sportifs' }] }, 1, 10)
    assert.ok(text.includes('id: `equipements`'), text)
    assert.ok(text.includes('slug: `equipements-sportifs`'), text)
    assert.ok(text.includes('https://example.org/data-fair/dataset/equipements'), text)
    assert.equal(structuredContent.results[0].id, 'equipements')
  })
})
