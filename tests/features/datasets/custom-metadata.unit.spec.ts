import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ajv } from '@data-fair/data-fair-shared/ajv.js'
import { customMetadataSchema, withCurrentLabels, formatCustomMetadata, trimCustomMetadata } from '../../../api/types/custom-metadata.ts'

const DEFS = [
  { key: 'text', title: 'Text' },
  { key: 'tags', title: 'Tags', multiple: true },
  { key: 'service', title: 'Service', enum: [{ code: 'VOI', label: 'Voirie' }, { code: 'URB', label: 'Urbanisme' }] },
  { key: 'domaines', title: 'Domaines', multiple: true, enum: [{ code: 'circ', label: 'Circulation' }] },
  { key: 'effectif', title: 'Effectif', type: 'integer' as const },
  { key: 'ratio', title: 'Ratio', type: 'number' as const },
  { key: 'validation', title: 'Validation', type: 'date' as const },
  { key: 'contact', title: 'Contact', type: 'link' as const }
]
const validate = ajv.compile(customMetadataSchema(DEFS))
const valid = (value: object) => validate(value)

test.describe('custom metadata schema', () => {
  test('a definition without type is text, legacy strings stay valid', () => {
    assert.ok(valid({ text: 'Voirie' }))
    assert.ok(!valid({ text: 12 }))
  })

  test('numbers, integer refuses decimals and 0 is a value', () => {
    assert.ok(valid({ effectif: 0, ratio: 1.5 }))
    assert.ok(!valid({ effectif: 1.5 }))
    assert.ok(!valid({ ratio: '1.5' }))
  })

  test('dates are YYYY-MM-DD and must exist', () => {
    assert.ok(valid({ validation: '2026-03-12' }))
    assert.ok(!valid({ validation: '2026-02-30' }))
    assert.ok(!valid({ validation: '12/03/2026' }))
  })

  test('links need an http url, the title is optional', () => {
    assert.ok(valid({ contact: { url: 'https://a.fr', title: 'A' } }))
    assert.ok(valid({ contact: { url: 'https://a.fr' } }))
    assert.ok(!valid({ contact: { title: 'A' } }))
    assert.ok(!valid({ contact: { url: 'javascript:alert(1)' } }))
  })

  test('a list value is a known code', () => {
    assert.ok(valid({ service: { code: 'VOI', label: 'whatever' } }))
    assert.ok(!valid({ service: { code: 'XXX', label: 'X' } }))
    assert.ok(!valid({ service: 'Voirie' }))
  })

  test('several values are arrays, only for text', () => {
    assert.ok(valid({ tags: ['a', 'b'], domaines: [{ code: 'circ' }] }))
    assert.ok(!valid({ tags: 'a' }))
    assert.ok(!valid({ domaines: [{ code: 'XXX' }] }))
    const intMultiple = ajv.compile(customMetadataSchema([{ key: 'n', title: 'N', type: 'integer', multiple: true }]))
    assert.ok(intMultiple({ n: 3 }))
  })

  test('keys without a definition are not checked', () => {
    assert.ok(valid({ unknown: { anything: true } }))
  })

  test('list labels come from the definition', () => {
    assert.deepEqual(withCurrentLabels(DEFS[2], { code: 'VOI', label: 'old' }), { code: 'VOI', label: 'Voirie' })
    assert.deepEqual(withCurrentLabels(DEFS[3], [{ code: 'circ' }]), [{ code: 'circ', label: 'Circulation' }])
    assert.equal(withCurrentLabels(DEFS[0], 'x'), 'x')
  })

  test('display text per shape', () => {
    assert.equal(formatCustomMetadata('Voirie'), 'Voirie')
    assert.equal(formatCustomMetadata(0), '0')
    assert.equal(formatCustomMetadata([{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }]), 'A, B')
    assert.equal(formatCustomMetadata({ url: 'https://a.fr', title: 'A' }), 'A (https://a.fr)')
    assert.equal(formatCustomMetadata({ url: 'https://a.fr' }), 'https://a.fr')
  })

  test('values are trimmed and emptied ones removed, 0 stays', () => {
    const cm: Record<string, unknown> = { a: ' x ', b: '  ', c: [' y ', ' '], d: [], e: { url: ' https://a.fr ', title: ' ' }, f: { url: ' ' }, g: 0, h: null }
    trimCustomMetadata(cm)
    assert.deepEqual(cm, { a: 'x', c: ['y'], e: { url: 'https://a.fr' }, g: 0 })
  })
})
