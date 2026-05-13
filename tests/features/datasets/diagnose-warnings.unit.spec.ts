import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  computeFinalizeWarnings,
  computeRealtimeWarnings,
  pickPrimaryCode,
  WARNING_PRIORITY
} from '../../../api/src/datasets/es/diagnose-warnings.ts'

const baseEsConfig = {
  nbReplicas: 1,
  maxShardSize: 10_000_000_000,
  diagnose: {
    segmentsPerShardWarn: 30,
    deletedRatioWarn: 0.2,
    mappingFieldsLimitWarn: 0.8,
    minShardSize: 1_000_000_000
  }
}

test.describe('diagnose-warnings', () => {
  test('virtual / meta-only dataset short-circuits to empty', () => {
    assert.deepEqual(computeFinalizeWarnings({ isVirtual: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ isVirtual: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeFinalizeWarnings({ isMetaOnly: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ isMetaOnly: true } as any, {}, baseEsConfig), [])
  })

  test('empty esInfos returns no warnings', () => {
    assert.deepEqual(computeFinalizeWarnings({ schema: [] } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ schema: [] } as any, {}, baseEsConfig), [])
  })

  test('WARNING_PRIORITY contains every code', () => {
    const codes = [
      'MissingIndex', 'IndexHealthRed', 'MissingIndexSettings', 'ShardingRecommended',
      'MissingSearchOnWide', 'MappingNearLimit', 'ReplicaDrift',
      'HighSegmentCount', 'LargeDeletedDocsRatio', 'ShardSizeOutOfBand', 'OrphanIndices'
    ]
    for (const code of codes) assert.ok(WARNING_PRIORITY.includes(code as any), `missing priority for ${code}`)
  })

  test('pickPrimaryCode returns null on empty array', () => {
    assert.equal(pickPrimaryCode([]), null)
  })
})

test.describe('existing finalize-time codes', () => {
  const wideDataset = (extra: any = {}) => ({
    schema: [{ key: 'a', type: 'string' }],
    storage: { indexed: { size: 1_000_000 } },
    ...extra
  })

  test('MissingIndex fires when esInfos.index is missing', () => {
    const w = computeFinalizeWarnings(wideDataset(), { indices: [] }, baseEsConfig)
    assert.equal(w.length, 1)
    assert.equal(w[0].code, 'MissingIndex')
    assert.equal(w[0].severity, 'error')
  })

  test('IndexHealthRed fires when index.health === "red"', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'red',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(wideDataset(), esInfos, baseEsConfig)
    assert.ok(w.find(x => x.code === 'IndexHealthRed' && x.severity === 'error'))
  })

  test('MissingIndexSettings fires when settings.index.number_of_shards is missing', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { settings: { index: {} }, mappings: { properties: {} } } }
    }
    const w = computeFinalizeWarnings(wideDataset(), esInfos, baseEsConfig)
    assert.ok(w.find(x => x.code === 'MissingIndexSettings' && x.severity === 'error'))
  })

  test('ShardingRecommended fires when current shard count != recommended', () => {
    // recommended = ceil(50go / maxShardSize=10go) = 5 ; current = 1 -> mismatch
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: {
          settings: { index: { number_of_shards: '1', number_of_replicas: '1' } },
          mappings: { properties: {} }
        }
      }
    }
    const dataset = wideDataset({ storage: { indexed: { size: 50_000_000_000 } } })
    const w = computeFinalizeWarnings(dataset, esInfos, baseEsConfig)
    const sr = w.find(x => x.code === 'ShardingRecommended')
    assert.ok(sr)
    assert.equal(sr!.severity, 'warning')
    assert.equal(sr!.details!.currentNbShards, 1)
    assert.equal(sr!.details!.recommendedNbShards, 5)
  })
})

test.describe('MissingSearchOnWide', () => {
  // hasManyQSearchFields counts analyzed inner sub-fields (.text + .text_standard);
  // each plain string column contributes 2 inner fields. Threshold is 30 -> need ≥ 16 columns.
  const wideSchema = Array.from({ length: 20 }, (_, i) => ({ key: `c${i}`, type: 'string' }))
  const baseDataset = { schema: wideSchema, storage: { indexed: { size: 1_000_000 } } }
  const goodSettings = { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } } }

  test('fires when wide dataset mapping lacks _search', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { c0: {} } } } }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'MissingSearchOnWide')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
  })

  test('does not fire when _search is present', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { c0: {}, _search: { type: 'text' } } } } }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MissingSearchOnWide'), undefined)
  })

  test('does not fire when schema is narrow', () => {
    const narrow = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { a: {} } } } }
    }
    const w = computeFinalizeWarnings(narrow, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MissingSearchOnWide'), undefined)
  })
})

test.describe('MappingNearLimit', () => {
  const settings = { index: { number_of_shards: '1', number_of_replicas: '1', 'mapping.total_fields.limit': 100 } }
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }

  test('fires above threshold', () => {
    const properties: Record<string, any> = {}
    for (let i = 0; i < 85; i++) properties[`f${i}`] = {}
    const esInfos = { indices: [], index: { health: 'green', definition: { settings, mappings: { properties } } } }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'MappingNearLimit')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.fields, 85)
    assert.equal(item!.details!.limit, 100)
  })

  test('does not fire below threshold', () => {
    const properties: Record<string, any> = {}
    for (let i = 0; i < 50; i++) properties[`f${i}`] = {}
    const esInfos = { indices: [], index: { health: 'green', definition: { settings, mappings: { properties } } } }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MappingNearLimit'), undefined)
  })
})

test.describe('ReplicaDrift', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }

  test('fires when replicas differ from config', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '0' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig) // config nbReplicas=1
    const item = w.find(x => x.code === 'ReplicaDrift')
    assert.ok(item)
    assert.equal(item!.severity, 'info')
    assert.equal(item!.details!.current, 0)
    assert.equal(item!.details!.expected, 1)
  })

  test('does not fire when replicas match', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ReplicaDrift'), undefined)
  })
})

test.describe('HighSegmentCount', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const goodIndex = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '2', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when segments per shard exceeds threshold', () => {
    const esInfos = goodIndex({ 'segments.count': '100' }) // 100 / 2 = 50 > 30
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'HighSegmentCount')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.segmentsPerShard, 50)
  })

  test('does not fire in finalize-time evaluator', () => {
    const esInfos = goodIndex({ 'segments.count': '100' })
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'HighSegmentCount'), undefined)
  })

  test('does not fire when segments per shard is below threshold', () => {
    const esInfos = goodIndex({ 'segments.count': '10' }) // 10 / 2 = 5 < 30
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'HighSegmentCount'), undefined)
  })
})

test.describe('LargeDeletedDocsRatio', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const idx = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when deleted ratio exceeds threshold and total > 1000', () => {
    const esInfos = idx({ 'docs.count': '6000', 'docs.deleted': '4000' }) // ratio 0.4 > 0.2
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'LargeDeletedDocsRatio')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.ratio.toFixed(2), '0.40')
  })

  test('does not fire when total docs <= 1000', () => {
    const esInfos = idx({ 'docs.count': '500', 'docs.deleted': '400' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'LargeDeletedDocsRatio'), undefined)
  })

  test('does not fire when ratio below threshold', () => {
    const esInfos = idx({ 'docs.count': '9000', 'docs.deleted': '500' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'LargeDeletedDocsRatio'), undefined)
  })
})

test.describe('ShardSizeOutOfBand', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const idx = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '2', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when avg shard size above maxShardSize', () => {
    // 30gb / 2 shards = 15gb > 10gb maxShardSize
    const esInfos = idx({ 'pri.store.size': String(30 * 1_000_000_000) })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'ShardSizeOutOfBand')
    assert.ok(item)
    assert.equal(item!.details!.avgShardSize, 15 * 1_000_000_000)
  })

  test('fires when avg shard size below minShardSize', () => {
    // 100mb / 2 = 50mb < 1gb minShardSize
    const esInfos = idx({ 'pri.store.size': String(100_000_000), 'docs.count': '500' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'ShardSizeOutOfBand')
    assert.ok(item)
  })

  test('does not fire when in band', () => {
    const esInfos = idx({ 'pri.store.size': String(3 * 1_000_000_000) }) // 3gb / 2 = 1.5gb, within [1gb, 10gb]
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ShardSizeOutOfBand'), undefined)
  })

  test('skips check when only 1 shard and below min (single-shard small datasets are fine)', () => {
    const oneShard = idx({
      'pri.store.size': String(100_000_000)
    })
    oneShard.index.definition.settings.index.number_of_shards = '1'
    const w = computeRealtimeWarnings(baseDataset, oneShard, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ShardSizeOutOfBand'), undefined)
  })
})
