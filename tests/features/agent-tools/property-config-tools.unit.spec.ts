import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  getRelevantCapabilities,
  resolveCapabilities,
  diffCapabilities,
  executeSetPropertyConfig
} from '../../../ui/src/composables/dataset/agent-property-config-tools-logic.ts'

// --- getRelevantCapabilities ---

test.describe('getRelevantCapabilities', () => {
  test('returns numeric capabilities for number type', () => {
    const caps = getRelevantCapabilities('number')
    assert.deepEqual(caps, ['index', 'textStandard', 'values'])
  })

  test('returns numeric capabilities for integer type', () => {
    const caps = getRelevantCapabilities('integer')
    assert.deepEqual(caps, ['index', 'textStandard', 'values'])
  })

  test('returns numeric capabilities for boolean type', () => {
    const caps = getRelevantCapabilities('boolean')
    assert.deepEqual(caps, ['index', 'textStandard', 'values'])
  })

  test('returns date capabilities for string with date format', () => {
    const caps = getRelevantCapabilities('string', 'date')
    assert.deepEqual(caps, ['index', 'textStandard', 'values'])
  })

  test('returns date-time capabilities for string with date-time format', () => {
    const caps = getRelevantCapabilities('string', 'date-time')
    assert.deepEqual(caps, ['index', 'textStandard', 'values'])
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
    assert.deepEqual(caps, ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive', 'wildcard'])
  })

  test('returns empty for unknown type', () => {
    const caps = getRelevantCapabilities('array')
    assert.deepEqual(caps, [])
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
