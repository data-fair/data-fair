import { test, expect } from '@playwright/test'
import path from 'node:path'
import { resolveSearchField, esProperty, getFilterableFields, resolveExistsFields } from '../../../../api/src/datasets/es/operations.ts'

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

// spec §4 — the query side targets the ONE field the mapping materializes. The keyword-view and
// wildcard fanouts are NOT part of this (a column with no analyzed field still reaches `q` through
// its keyword view); those are pinned by tests/features/datasets/query/q-fields.unit.spec.ts.
test.describe('routing targets the effective field', () => {
  // getFilterableFields is memoized on `${id}:${finalizedAt}:${!!hasQ}:${qFields}`
  let seq = 0
  const dataset = () => ({
    id: 'lang-route-' + (seq++),
    finalizedAt: 'x',
    schema: [
      { key: 'fr1', type: 'string', language: 'fr' },
      { key: 'std1', type: 'string' },
      { key: 'veto1', type: 'string', language: 'fr', 'x-capabilities': { text: false } },
      { key: 'num1', type: 'number' }
    ]
  })

  test('qSearchFields contain exactly one analyzed entry per column', () => {
    const ff = getFilterableFields(dataset(), true, null)
    expect(ff.qSearchFields).toContain('fr1.text')
    expect(ff.qSearchFields).not.toContain('fr1.text_standard')
    expect(ff.qSearchFields).toContain('std1.text_standard')
    // explicit text:false vetoes the language meta -> standard analysis, still searchable
    expect(ff.qSearchFields).toContain('veto1.text_standard')
    expect(ff.qSearchFields).not.toContain('veto1.text')
    expect(ff.qSearchFields).toContain('num1.text_standard')
  })

  test('esFields allowlist only exposes the materialized analyzed name', () => {
    const ff = getFilterableFields(dataset(), true, null)
    expect(ff.esFields).toContain('fr1.text')
    expect(ff.esFields).not.toContain('fr1.text_standard')
    expect(ff.esFields).not.toContain('std1.text')
    expect(ff.esFields).toContain('std1.text_standard')
  })

  test('superset guarantee: every routed field is a legacy field name', () => {
    const ff = getFilterableFields(dataset(), true, null)
    for (const f of [...ff.qSearchFields, ...ff.searchFields]) {
      // `.keyword_insensitive` is routed for non-searchable string columns and `.wildcard` for
      // wildcard columns — both are legacy field names too, so they belong in this allowlist.
      expect(f).toMatch(/^_search|\.(text|text_standard)(\^\d)?$|\.(keyword_insensitive|wildcard)$|^[^.]+$/)
    }
  })

  test('resolveExistsFields unions the keyword view with the effective analyzed field', () => {
    // flagged=true is the ignore_above escape hatch: a language column must union `.text`, a
    // language-less one `.text_standard` — never a name its mapping does not carry
    expect(resolveExistsFields({ key: 'fr1', type: 'string', language: 'fr' }, true)).toEqual(['fr1', 'fr1.text'])
    expect(resolveExistsFields({ key: 'std1', type: 'string' }, true)).toEqual(['std1', 'std1.text_standard'])
    // no analyzed field at all and no wildcard -> keyword only, no safe fallback
    expect(resolveExistsFields({ key: 'tag', type: 'string', 'x-capabilities': { text: false, textStandard: false } }, true)).toEqual(['tag'])
    // not flagged -> fast keyword path, unchanged
    expect(resolveExistsFields({ key: 'fr1', type: 'string', language: 'fr' }, false)).toEqual(['fr1'])
  })
})
