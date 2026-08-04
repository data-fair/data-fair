import { test, expect } from '@playwright/test'
import path from 'node:path'
import { resolveSearchField, esProperty } from '../../../../api/src/datasets/es/operations.ts'

// data-schema.ts imports `#config` at module load (config.ts validates on import). The unit harness
// doesn't set NODE_CONFIG_DIR, so point node-config at the real api/config dir and load the module via
// dynamic import (after this assignment) so config resolves — same pattern as
// lines-pipeline.unit.spec.ts / rate-limiting-end-parts.unit.spec.ts. operations.ts has no config
// dependency so it is imported statically above.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../../api/config')

const load = async () => await import('../../../../api/src/datasets/utils/data-schema.ts')

test.describe('defaultLanguage / stampSchemaLanguage', () => {
  test('stamps plain string columns where text capability is active', async () => {
    const { defaultLanguage } = await load()
    expect(defaultLanguage({ key: 'a', type: 'string' }, 'fr')).toBe('fr')
    expect(defaultLanguage({ key: 'a', type: 'string', format: 'uri-reference' }, 'fr')).toBe('fr')
    expect(defaultLanguage({ key: 'a', type: 'string', 'x-capabilities': { text: true } }, 'fr')).toBe('fr')
  })
  test('does not stamp when vetoed, non-string, dated, or already set', async () => {
    const { defaultLanguage } = await load()
    expect(defaultLanguage({ key: 'a', type: 'string', 'x-capabilities': { text: false } }, 'fr')).toBeUndefined()
    expect(defaultLanguage({ key: 'a', type: 'number' }, 'fr')).toBeUndefined()
    expect(defaultLanguage({ key: 'a', type: 'string', format: 'date-time' }, 'fr')).toBeUndefined()
    expect(defaultLanguage({ key: 'a', type: 'string', language: 'en' }, 'fr')).toBeUndefined()
  })
  test('stampSchemaLanguage mutates only unstamped eligible columns and reports changes', async () => {
    const { stampSchemaLanguage } = await load()
    const schema = [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'string', language: 'en' },
      { key: 'c', type: 'string', 'x-capabilities': { text: false } }
    ]
    expect(stampSchemaLanguage(schema, 'fr')).toBe(true)
    expect(schema[0].language).toBe('fr')
    expect(schema[1].language).toBe('en')
    expect(schema[2].language).toBeUndefined()
    expect(stampSchemaLanguage(schema, 'fr')).toBe(false) // idempotent
  })
})

test.describe('upgrade script: stamp language', () => {
  test('upgrade script stamps main and draft schemas, skips untouched datasets, is idempotent', async () => {
    const upgradeScript = await import('../../../../api/upgrade/6.17.1/stamp-schema-language.ts').then(m => m.default)
    const docs: any[] = [
      { _id: 1, schema: [{ key: 'a', type: 'string' }] },
      { _id: 2, schema: [{ key: 'b', type: 'string', language: 'en' }], draft: { schema: [{ key: 'c', type: 'string' }] } },
      { _id: 3, schema: [{ key: 'd', type: 'number' }] }
    ]
    const updates: any[] = []
    const db: any = {
      collection: () => ({
        find: () => docs,
        updateOne: async (filter: any, update: any) => { updates.push({ filter, update }) }
      })
    }
    await upgradeScript.exec(db, () => {})
    expect(updates.map(u => u.filter._id)).toEqual([1, 2])
    expect(docs[0].schema[0].language).toBe('fr')
    expect(docs[1].schema[0].language).toBe('en') // pre-existing value preserved
    expect(docs[1].draft.schema[0].language).toBe('fr') // draft covered
    expect(docs[2].schema[0].language).toBeUndefined() // non-string untouched, no update issued

    updates.length = 0
    await upgradeScript.exec(db, () => {})
    expect(updates).toEqual([]) // idempotent re-run
  })
})

test.describe('resolveSearchField', () => {
  test('veto and materialization rules from the spec', () => {
    expect(resolveSearchField({ key: 'a', type: 'string', language: 'fr' }))
      .toEqual({ searchable: true, language: 'fr', field: 'a.text' })
    expect(resolveSearchField({ key: 'a', type: 'string' }))
      .toEqual({ searchable: true, field: 'a.text_standard' })
    expect(resolveSearchField({ key: 'a', type: 'string', language: 'fr', 'x-capabilities': { text: false } }))
      .toEqual({ searchable: true, field: 'a.text_standard' }) // explicit text:false vetoes language
    expect(resolveSearchField({ key: 'a', type: 'string', 'x-capabilities': { text: false, textStandard: false } }))
      .toEqual({ searchable: false })
    expect(resolveSearchField({ key: 'n', type: 'number' }))
      .toEqual({ searchable: true, field: 'n.text_standard' }) // scalars: textStandard only
    expect(resolveSearchField({ key: 'n', type: 'number', 'x-capabilities': { textStandard: false } }))
      .toEqual({ searchable: false })
  })
  test('legacy french-only column targets .text, stamped or not', () => {
    // its index carries .text and NOT .text_standard — targeting standard would silently under-match
    expect(resolveSearchField({ key: 'a', type: 'string', 'x-capabilities': { textStandard: false } }))
      .toEqual({ searchable: true, field: 'a.text' })
    expect(resolveSearchField({ key: 'a', type: 'string', language: 'fr', 'x-capabilities': { textStandard: false } }))
      .toEqual({ searchable: true, language: 'fr', field: 'a.text' })
  })
})

test.describe('esProperty single analyzed field', () => {
  test('language column gets .text only', () => {
    const p = esProperty({ key: 'a', type: 'string', language: 'fr' }, 'custom_french')
    expect(p.fields.text).toEqual({ type: 'text', analyzer: 'custom_french', fielddata: undefined })
    expect(p.fields.text_standard).toBeUndefined()
  })
  test('language-less column gets .text_standard only', () => {
    const p = esProperty({ key: 'a', type: 'string' }, 'custom_french')
    expect(p.fields.text_standard).toEqual({ type: 'text', analyzer: 'standard', fielddata: undefined })
    expect(p.fields.text).toBeUndefined()
  })
  test('veto: text:false + language yields .text_standard only', () => {
    const p = esProperty({ key: 'a', type: 'string', language: 'fr', 'x-capabilities': { text: false } }, 'custom_french')
    expect(p.fields.text).toBeUndefined()
    expect(p.fields.text_standard).toBeDefined()
  })
  test('textAgg fielddata lands on the single field', () => {
    const p = esProperty({ key: 'a', type: 'string', language: 'fr', 'x-capabilities': { textAgg: true } }, 'custom_french')
    expect(p.fields.text.fielddata).toBe(true)
  })
  test('non-searchable string has no analyzed field; scalars unchanged', () => {
    const p = esProperty({ key: 'a', type: 'string', 'x-capabilities': { text: false, textStandard: false } }, 'custom_french')
    expect(p.fields.text).toBeUndefined(); expect(p.fields.text_standard).toBeUndefined()
    const n = esProperty({ key: 'n', type: 'number' }, 'custom_french')
    expect(n.fields.text_standard).toEqual({ type: 'text', analyzer: 'standard' })
  })
})
