/**
 * `open_edit_line_dialog` requires a line `_id` and its own description says to
 * find one with search_data. search_data mapped every row through `cleanRow`,
 * which destructures `_id` out unconditionally — so the tool it names could never
 * supply what it demands, not even when the caller passed `select=_id`.
 *
 * A judged run walked straight into that loop: three searches explicitly selected
 * `_id`, all three came back without it, the sub-agent reported `_id` « non exposé
 * par l'API », and the assistant told the person to find the row and click the
 * pencil themselves — which the persona had said it would not do, and refused.
 * It then promised to fetch the id itself, spent four dispatches failing, and
 * retracted the promise in front of them.
 *
 * `_id` stays out of ordinary reads — it is noise in a table a person is meant to
 * read — but a caller that names it is addressing a row, not browsing.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatResult } from '../../../agent-tools/search-data.ts'

const data = {
  total: 2,
  results: [
    { _id: 'dem-2', _i: 7, _rand: 42, association: 'Club de judo du centre', montant: 12000 },
    { _id: 'dem-1', _i: 3, _rand: 17, association: 'Harmonie municipale', montant: 800 }
  ]
}
const params = { datasetId: 'demandes' }

test.describe('search_data and the line id', () => {
  test('keeps rows clean when nothing asked for the id', () => {
    const { text } = formatResult(data, params)
    assert.ok(!text.includes('dem-2'), text)
    assert.ok(!text.includes('_id'), text)
    assert.ok(text.includes('Club de judo du centre'), text)
  })

  test('returns the id when the caller selects it', () => {
    const { text } = formatResult(data, { ...params, select: 'association,montant,_id' })
    assert.ok(text.includes('dem-2'), text)
    assert.ok(text.includes('_id'), text)
  })

  test('tolerates the spacing a model actually writes', () => {
    const { text } = formatResult(data, { ...params, select: '_id, association' })
    assert.ok(text.includes('dem-1'), text)
  })

  test('still drops the index and the sampling key, selected or not', () => {
    // Those two address nothing; they are Elasticsearch bookkeeping, and a model
    // that sees them will eventually try to use them as identifiers. Asserted on
    // the CSV header rather than the whole text, which also echoes the caller's
    // own `Filter query: select=…` back to them verbatim.
    const { text, structuredContent } = formatResult(data, { ...params, select: '_id,_i,_rand,association' })
    const header = text.split('\n').find(l => l.startsWith('_id'))!
    assert.equal(header, '_id,association,montant')
    assert.ok(!('_rand' in structuredContent.results[0]))
    assert.ok(!('_i' in structuredContent.results[0]))
    assert.equal(structuredContent.results[0]._id, 'dem-2')
  })

  test('carries the id into the structured content too, on the same condition', () => {
    assert.equal(formatResult(data, { ...params, select: '_id' }).structuredContent.results[0]._id, 'dem-2')
    assert.ok(!('_id' in formatResult(data, params).structuredContent.results[0]))
  })
})
