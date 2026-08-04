import { test, expect } from '@playwright/test'
import path from 'node:path'
import { resolveSearchField } from '../../../../api/src/datasets/es/operations.ts'

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
