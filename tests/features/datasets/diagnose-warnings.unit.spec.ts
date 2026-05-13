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
