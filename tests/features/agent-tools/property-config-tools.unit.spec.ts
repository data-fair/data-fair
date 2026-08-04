import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  getRelevantCapabilities,
  resolveCapabilities,
  diffCapabilities,
  getTextSearchKind,
  resolveTextSearch,
  buildTextSearchPatch,
  executeSetPropertyConfig
} from '../../../ui/src/composables/dataset/agent-property-config-tools-logic.ts'

// --- getRelevantCapabilities ---
// text/textStandard are deprecated-but-accepted storage keys: they no longer appear in the
// "relevant" capabilities list, since they are now driven via the searchable/language surface
// (see the buildTextSearchPatch/getTextSearchKind describe blocks below).

test.describe('getRelevantCapabilities', () => {
  test('returns numeric capabilities for number type', () => {
    const caps = getRelevantCapabilities('number')
    assert.deepEqual(caps, ['index', 'values'])
  })

  test('returns numeric capabilities for integer type', () => {
    const caps = getRelevantCapabilities('integer')
    assert.deepEqual(caps, ['index', 'values'])
  })

  test('returns numeric capabilities for boolean type', () => {
    const caps = getRelevantCapabilities('boolean')
    assert.deepEqual(caps, ['index', 'values'])
  })

  test('returns date capabilities for string with date format', () => {
    const caps = getRelevantCapabilities('string', 'date')
    assert.deepEqual(caps, ['index', 'values'])
  })

  test('returns date-time capabilities for string with date-time format', () => {
    const caps = getRelevantCapabilities('string', 'date-time')
    assert.deepEqual(caps, ['index', 'values'])
  })

  test('returns geo capabilities for geometry concept', () => {
    const caps = getRelevantCapabilities('string', undefined, 'https://purl.org/geojson/vocab#geometry')
    assert.deepEqual(caps, ['geoShape', 'vtPrepare'])
  })

  test('returns attachment capabilities for DigitalDocument concept', () => {
    const caps = getRelevantCapabilities('string', undefined, 'http://schema.org/DigitalDocument')
    assert.deepEqual(caps, ['indexAttachment'])
  })

  test('returns string capabilities for plain string', () => {
    const caps = getRelevantCapabilities('string')
    assert.deepEqual(caps, ['index', 'textAgg', 'values', 'insensitive', 'wildcard'])
  })

  test('returns empty for unknown type', () => {
    const caps = getRelevantCapabilities('array')
    assert.deepEqual(caps, [])
  })
})

// --- getTextSearchKind / buildTextSearchPatch (searchable + language serialization) ---
// Mirrors the spec §5.4 table also implemented in dataset-property-capabilities.vue's apply():
// off -> text:false, textStandard:false; on+language -> both absent; on+standard -> text:false only.

test.describe('getTextSearchKind', () => {
  test('plain string columns get the language kind', () => {
    assert.equal(getTextSearchKind('string'), 'language')
    assert.equal(getTextSearchKind('string', 'uri-reference'), 'language')
  })

  test('non-string and date-formatted string columns get the plain kind', () => {
    assert.equal(getTextSearchKind('number'), 'plain')
    assert.equal(getTextSearchKind('integer'), 'plain')
    assert.equal(getTextSearchKind('boolean'), 'plain')
    assert.equal(getTextSearchKind('string', 'date'), 'plain')
    assert.equal(getTextSearchKind('string', 'date-time'), 'plain')
  })

  test('geometry and attachment columns get no text-search kind', () => {
    assert.equal(getTextSearchKind('string', undefined, 'https://purl.org/geojson/vocab#geometry'), 'none')
    assert.equal(getTextSearchKind('string', undefined, 'http://schema.org/DigitalDocument'), 'none')
  })
})

// read-back must agree with the API's resolveSearchField, kind by kind
test.describe('resolveTextSearch', () => {
  test('plain kind reads back textStandard ALONE', () => {
    // `text` is never written on a plain (non-string / dated-string) column and never materializes
    // a field there, so `{textStandard: false}` — what the previous UI wrote for these types —
    // means "not searchable". The any-of gate read it back as ON while the API resolved OFF.
    assert.deepEqual(resolveTextSearch({ textStandard: false }, undefined, 'plain'), { searchable: false })
    assert.deepEqual(resolveTextSearch({}, undefined, 'plain'), { searchable: true })
    assert.deepEqual(resolveTextSearch({ text: false }, undefined, 'plain'), { searchable: true })
    assert.deepEqual(resolveTextSearch(undefined, undefined, 'plain'), { searchable: true })
  })
  test('language kind keeps the any-of gate and the effective language', () => {
    assert.deepEqual(resolveTextSearch(undefined, 'fr', 'language'), { searchable: true, language: 'fr' })
    assert.deepEqual(resolveTextSearch({ text: false }, 'fr', 'language'), { searchable: true, language: null })
    assert.deepEqual(resolveTextSearch({ textStandard: false }, 'fr', 'language'), { searchable: true, language: 'fr' })
    assert.deepEqual(resolveTextSearch({ text: false, textStandard: false }, 'fr', 'language'), { searchable: false, language: null })
  })
  test('none kind is never searchable', () => {
    assert.deepEqual(resolveTextSearch({ text: false }, undefined, 'none'), { searchable: false })
  })
})

test.describe('buildTextSearchPatch', () => {
  test('off -> text:false, textStandard:false, language:null', () => {
    const patch = buildTextSearchPatch('language', false)
    assert.deepEqual(patch, { capabilities: { text: false, textStandard: false }, language: null })
  })

  test('on + language fr -> deprecated keys absent (true), language set', () => {
    const patch = buildTextSearchPatch('language', true, 'fr')
    assert.deepEqual(patch, { capabilities: { text: true, textStandard: true }, language: 'fr' })
  })

  test('on + standard -> text:false only, language:null', () => {
    const patch = buildTextSearchPatch('language', true, null)
    assert.deepEqual(patch, { capabilities: { text: false, textStandard: true }, language: null })
  })

  test('plain kind only ever sets textStandard, never language', () => {
    assert.deepEqual(buildTextSearchPatch('plain', false), { capabilities: { textStandard: false } })
    assert.deepEqual(buildTextSearchPatch('plain', true), { capabilities: { textStandard: true } })
  })
  test('stored deprecated keys the serialization does not express are carried through', () => {
    // a 'plain' column's toggle only expresses textStandard — a stored `text` must survive
    assert.deepEqual(buildTextSearchPatch('plain', true, undefined, { text: false }), { capabilities: { textStandard: true, text: false } })
    // a 'none' column (geometry / attachment) has no toggle at all — the stored pair is kept whole
    assert.deepEqual(
      buildTextSearchPatch('none', true, undefined, { text: false, textStandard: false }),
      { capabilities: { text: false, textStandard: false } }
    )
    assert.deepEqual(buildTextSearchPatch('none', true), { capabilities: {} })
  })
})

// --- resolveCapabilities ---

test.describe('resolveCapabilities', () => {
  test('uses defaults when no overrides', () => {
    const resolved = resolveCapabilities(undefined, ['index', 'textAgg', 'wildcard'])
    // index defaults to true, textAgg defaults to false, wildcard defaults to false
    assert.equal(resolved.index, true)
    assert.equal(resolved.textAgg, false)
    assert.equal(resolved.wildcard, false)
  })

  test('applies overrides over defaults', () => {
    const resolved = resolveCapabilities({ textAgg: true, index: false }, ['index', 'textAgg'])
    assert.equal(resolved.index, false)
    assert.equal(resolved.textAgg, true)
  })

  test('only includes relevant keys', () => {
    const resolved = resolveCapabilities({ textAgg: true }, ['index'])
    assert.deepEqual(Object.keys(resolved), ['index'])
  })
})

// --- diffCapabilities ---

test.describe('diffCapabilities', () => {
  test('returns empty when all values match defaults', () => {
    const diff = diffCapabilities({ index: true, textAgg: false, wildcard: false })
    assert.deepEqual(diff, {})
  })

  test('returns only non-default values', () => {
    const diff = diffCapabilities({ index: false, textAgg: true, wildcard: false })
    assert.deepEqual(diff, { index: false, textAgg: true })
  })
})

// --- executeSetPropertyConfig ---

test.describe('executeSetPropertyConfig', () => {
  test('returns error when no dataset loaded', () => {
    const result = executeSetPropertyConfig({ configs: [] }, null, () => {})
    assert.equal(result, 'Error: No dataset loaded')
  })

  test('returns error for type override on non-file dataset', () => {
    const dataset = {
      schema: [{ key: 'col1' }]
    }
    const result = executeSetPropertyConfig(
      { configs: [{ key: 'col1', typeOverrideType: 'number' }] },
      dataset,
      () => {}
    )
    assert.ok(result.includes('Type overrides are only available for file datasets'))
  })

  test('allows type override on file dataset', () => {
    const dataset = {
      file: { name: 'test.csv' },
      schema: [{ key: 'col1' }]
    }
    let called = false
    const result = executeSetPropertyConfig(
      { configs: [{ key: 'col1', typeOverrideType: 'number' }] },
      dataset,
      () => { called = true }
    )
    assert.ok(called)
    assert.ok(result.includes('Successfully applied'))
    assert.ok(result.includes('1 type override'))
  })

  test('returns error for unknown column keys', () => {
    const dataset = {
      file: { name: 'test.csv' },
      schema: [{ key: 'col1' }]
    }
    const result = executeSetPropertyConfig(
      { configs: [{ key: 'nonexistent' }] },
      dataset,
      () => {}
    )
    assert.ok(result.includes('Unknown column keys: nonexistent'))
  })

  test('handles clearTypeOverride', () => {
    const dataset = {
      file: { name: 'test.csv' },
      schema: [{ key: 'col1' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', clearTypeOverride: true }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.equal(receivedConfigs[0].typeOverride, null)
  })

  test('handles typeOverride with format', () => {
    const dataset = {
      file: { name: 'test.csv' },
      schema: [{ key: 'col1' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', typeOverrideType: 'string', typeOverrideFormat: 'date' }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.deepEqual(receivedConfigs[0].typeOverride, { type: 'string', format: 'date' })
  })

  test('handles resetCapabilities', () => {
    const dataset = {
      schema: [{ key: 'col1' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', resetCapabilities: true }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.equal(receivedConfigs[0].capabilities, null)
  })

  test('applies diffCapabilities on provided capabilities', () => {
    const dataset = {
      schema: [{ key: 'col1' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', capabilities: { index: true, textAgg: true } }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    // index=true is the default, so should be excluded. textAgg=true differs from default (false).
    assert.deepEqual(receivedConfigs[0].capabilities, { textAgg: true })
  })

  test('wires searchable+language into capabilities diff and result.language', () => {
    const dataset = {
      schema: [{ key: 'col1', type: 'string' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', searchable: true, language: 'fr' }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    // on + language fr -> text/textStandard both default (true) so they diff away to {}
    assert.deepEqual(receivedConfigs[0].capabilities, {})
    assert.equal(receivedConfigs[0].language, 'fr')
  })

  test('wires searchable=false into capabilities diff and clears language', () => {
    const dataset = {
      schema: [{ key: 'col1', type: 'string' }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'col1', searchable: false }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.deepEqual(receivedConfigs[0].capabilities, { text: false, textStandard: false })
    assert.equal(receivedConfigs[0].language, null)
  })

  test('a none-kind column keeps its stored text capabilities through an edit', () => {
    const dataset = {
      schema: [{
        key: 'doc',
        type: 'string',
        'x-refersTo': 'http://schema.org/DigitalDocument',
        'x-capabilities': { text: false, textStandard: false, insensitive: false }
      }]
    }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'doc', searchable: true }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.deepEqual(receivedConfigs[0].capabilities, { text: false, textStandard: false, insensitive: false })
  })

  test('a plain-kind column keeps its stored text key, and searchable maps to textStandard', () => {
    const dataset = { schema: [{ key: 'n', type: 'number', 'x-capabilities': { text: false, values: false } }] }
    let receivedConfigs: any[] = []
    executeSetPropertyConfig(
      { configs: [{ key: 'n', searchable: false }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.deepEqual(receivedConfigs[0].capabilities, { text: false, textStandard: false, values: false })
  })

  test('language alone is applied (and implies searchable) instead of being silently dropped', () => {
    const dataset = { schema: [{ key: 'col1', type: 'string', 'x-capabilities': { text: false } }] }
    let receivedConfigs: any[] = []
    const result = executeSetPropertyConfig(
      { configs: [{ key: 'col1', language: 'fr' }] },
      dataset,
      (configs) => { receivedConfigs = configs }
    )
    assert.equal(receivedConfigs[0].language, 'fr')
    // the text:false veto is cleared, otherwise the language would never take effect
    assert.deepEqual(receivedConfigs[0].capabilities, {})
    assert.ok(result.includes('1 language config'))
  })

  test('language on a column that cannot carry one is an explicit error, not a false success', () => {
    const dataset = { schema: [{ key: 'n', type: 'number' }, { key: 'd', type: 'string', format: 'date' }] }
    for (const key of ['n', 'd']) {
      let called = false
      const result = executeSetPropertyConfig(
        { configs: [{ key, language: 'fr' }] },
        dataset,
        () => { called = true }
      )
      assert.ok(result.startsWith('Error:'), `expected an error for ${key}, got: ${result}`)
      assert.equal(called, false)
    }
  })

  test('reports correct counts in summary', () => {
    const dataset = {
      file: { name: 'test.csv' },
      schema: [{ key: 'col1' }, { key: 'col2' }]
    }
    const result = executeSetPropertyConfig(
      {
        configs: [
          { key: 'col1', typeOverrideType: 'number' },
          { key: 'col2', capabilities: { textAgg: true } }
        ]
      },
      dataset,
      () => {}
    )
    assert.ok(result.includes('1 type override'))
    assert.ok(result.includes('1 capability config'))
  })
})
