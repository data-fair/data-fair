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
