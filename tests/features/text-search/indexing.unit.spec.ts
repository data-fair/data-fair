import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { buildIndexFields, extractFieldValue } from '../../../api/src/misc/utils/text-search/indexing.ts'

const def = validateDefinition({ fields: { title: 3, 'topics.title': 1, keywords: 1 }, language: 'fr', version: 1 })
const analyzer = createAnalyzer('fr')
const build = (doc: any) => buildIndexFields(doc, def, analyzer)

test.describe('validateDefinition', () => {
  test('applies the documented defaults', () => {
    const d = validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1 })
    assert.equal(d.gateSize, 3)
    assert.equal(d.tieBreaker, 0.3)
    assert.equal(d.tieBreakField, 'id')
  })

  test('refuses gateSize 1 — it returns an empty page on a single typo', () => {
    assert.throws(() => validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: 1 }), /gateSize/)
  })

  test('refuses an empty field map and non-positive weights', () => {
    assert.throws(() => validateDefinition({ fields: {}, language: 'fr', version: 1 }), /fields/)
    assert.throws(() => validateDefinition({ fields: { title: 0 }, language: 'fr', version: 1 }), /weight/)
  })
})

test.describe('extractFieldValue', () => {
  test('reads a plain path', () => {
    assert.equal(extractFieldValue({ title: 'Consommation' }, 'title'), 'Consommation')
  })

  test('traverses an array of objects', () => {
    assert.equal(extractFieldValue({ topics: [{ title: 'Energie' }, { title: 'Climat' }] }, 'topics.title'), 'Energie Climat')
  })

  test('joins a plain array', () => {
    assert.equal(extractFieldValue({ keywords: ['gaz', 'electricite'] }, 'keywords'), 'gaz electricite')
  })

  test('missing paths and non-strings give an empty string', () => {
    assert.equal(extractFieldValue({}, 'title'), '')
    assert.equal(extractFieldValue({ a: { b: null } }, 'a.b'), '')
    assert.equal(extractFieldValue({ n: 42 }, 'n'), '42')
  })
})

test.describe('buildIndexFields', () => {
  test('collects unique stems across fields into _terms', () => {
    const r = build({ title: 'Charges communes', keywords: ['charge'] })!
    assert.ok(r._terms.includes('charg'))
    assert.ok(r._terms.includes('commun'))
    assert.equal(new Set(r._terms).size, r._terms.length, '_terms must be unique')
  })

  test('_pos holds raw positions per field per stem, and _len the kept token count', () => {
    const r = build({ title: 'courbe de charge' })!
    assert.deepEqual(r._pos.title.courb, [0])
    assert.deepEqual(r._pos.title.charg, [2])
    assert.equal(r._len.title, 2)
  })

  test('a repeated term records every position', () => {
    const r = build({ title: 'charge charge' })!
    assert.deepEqual(r._pos.title.charg, [0, 1])
  })

  test('fields with no content are omitted from _pos but present in _len as 0', () => {
    const r = build({ title: 'charge' })!
    assert.equal(r._pos['topics.title'], undefined)
    assert.equal(r._len['topics.title'], 0)
  })

  test('returns null when the document has nothing indexable', () => {
    assert.equal(build({}), null)
    assert.equal(build({ title: '   ' }), null)
  })

  test('throws if a stem is not a safe mongo key', () => {
    // stems become object keys in _pos; a '.' or leading '$' would corrupt the write silently
    const bad = createAnalyzer('fr', { fr: () => 'a.b' })
    assert.throws(() => buildIndexFields({ title: 'charge' }, def, bad), /unsafe/)
  })
})
