import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  mapClusterHealth,
  mapNodes,
  mapLongTasks,
  mapUnassignedShards,
  mapIndicesSummary,
  resolveWatermark,
  safeSection
} from '../../../api/src/admin/elasticsearch-diagnose.ts'

test.describe('resolveWatermark', () => {
  test('ok when below low', () => {
    assert.equal(resolveWatermark(50, 85, 90, 95), 'ok')
  })
  test('low when between low and high', () => {
    assert.equal(resolveWatermark(87, 85, 90, 95), 'low')
  })
  test('high when between high and flood', () => {
    assert.equal(resolveWatermark(92, 85, 90, 95), 'high')
  })
  test('flood when at or above flood', () => {
    assert.equal(resolveWatermark(96, 85, 90, 95), 'flood')
  })
  test('null when input pct is null', () => {
    assert.equal(resolveWatermark(null, 85, 90, 95), null)
  })
})

test.describe('mapClusterHealth', () => {
  test('maps standard health response', () => {
    const health = {
      cluster_name: 'es-test',
      status: 'green',
      number_of_nodes: 3,
      number_of_data_nodes: 2,
      active_primary_shards: 10,
      active_shards: 20,
      relocating_shards: 0,
      initializing_shards: 0,
      unassigned_shards: 0
    }
    const result = mapClusterHealth(health as any, [{ time_in_queue_millis: 42 }, { time_in_queue_millis: 15 }] as any)
    assert.equal(result.name, 'es-test')
    assert.equal(result.status, 'green')
    assert.equal(result.numberOfNodes, 3)
    assert.equal(result.numberOfDataNodes, 2)
    assert.equal(result.activeShards, 20)
    assert.equal(result.pendingTasks.count, 2)
    assert.equal(result.pendingTasks.maxAgeMs, 42)
  })

  test('handles empty pending tasks', () => {
    const result = mapClusterHealth({ cluster_name: 'x', status: 'green' } as any, [])
    assert.equal(result.pendingTasks.count, 0)
    assert.equal(result.pendingTasks.maxAgeMs, null)
  })
})

test.describe('mapNodes', () => {
  test('maps a single data node, filters thread pools, computes watermark', () => {
    const nodesStats = {
      nodes: {
        nodeA: {
          name: 'node-a',
          roles: ['data', 'master'],
          jvm: { mem: { heap_used_percent: 60 } },
          os: { cpu: { percent: 12, load_average: { '1m': 0.5 } } },
          fs: { data: [{ total_in_bytes: 1000, available_in_bytes: 200 }] },
          breakers: {
            parent: { tripped: 0 },
            fielddata: { tripped: 3 },
            request: { tripped: 0 }
          },
          thread_pool: {
            search: { active: 1, queue: 0, rejected: 0 },
            write: { active: 2, queue: 5, rejected: 0 },
            bulk: { active: 0, queue: 0, rejected: 7 }
          },
          indexing_pressure: {
            memory: {
              current: {
                combined_coordinating_and_primary_in_bytes: 100,
                primary_in_bytes: 60,
                coordinating_in_bytes: 40
              }
            }
          }
        }
      }
    }
    const watermarks = { lowPct: 85, highPct: 90, floodPct: 95 }
    const shardsByNode = new Map([['node-a', 7]])
    const out = mapNodes(nodesStats as any, watermarks, shardsByNode)
    assert.equal(out.length, 1)
    const n = out[0]
    assert.equal(n.id, 'nodeA')
    assert.equal(n.name, 'node-a')
    assert.deepEqual(n.roles, ['data', 'master'])
    assert.equal(n.isDataNode, true)
    assert.equal(n.heapUsedPct, 60)
    assert.equal(n.cpuPct, 12)
    assert.equal(n.load1m, 0.5)
    assert.equal(n.disk.usedBytes, 800)
    assert.equal(n.disk.totalBytes, 1000)
    assert.equal(n.disk.usedPct, 80)
    assert.equal(n.disk.watermark, 'ok')
    assert.equal(n.shardCount, 7)
    assert.equal(n.breakers.fielddata.tripped, 3)
    assert.equal(n.threadPoolsOfInterest.length, 2)
    assert.equal(n.threadPoolsOfInterest[0].name, 'bulk') // rejected first
    assert.equal(n.indexingPressure?.currentCombinedBytes, 100)
  })

  test('isDataNode true for data_hot / data_warm / data_cold roles', () => {
    const nodesStats = {
      nodes: {
        n1: { name: 'h', roles: ['data_hot'], fs: { data: [] }, breakers: {}, thread_pool: {} }
      }
    }
    const out = mapNodes(nodesStats as any, { lowPct: 85, highPct: 90, floodPct: 95 }, new Map())
    assert.equal(out[0].isDataNode, true)
  })

  test('null fields when ES omits metrics', () => {
    const nodesStats = {
      nodes: { n1: { name: 'x', roles: [], breakers: {}, thread_pool: {}, fs: { data: [] } } }
    }
    const out = mapNodes(nodesStats as any, { lowPct: 85, highPct: 90, floodPct: 95 }, new Map())
    assert.equal(out[0].heapUsedPct, null)
    assert.equal(out[0].cpuPct, null)
    assert.equal(out[0].load1m, null)
    assert.equal(out[0].disk.totalBytes, null)
    assert.equal(out[0].disk.usedPct, null)
    assert.equal(out[0].indexingPressure, null)
  })
})

test.describe('mapLongTasks', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 12)
  const idxA = `${indicesPrefix}-ds-a-${sha('ds-a')}`

  test('filters by threshold and parses dataset id from description', () => {
    const tasksResponse = {
      nodes: {
        nodeX: {
          name: 'coordinator',
          tasks: {
            t1: {
              action: 'indices:data/read/search',
              running_time_in_nanos: 5_000_000_000,
              description: `indices[${idxA}], search[ ... ]`
            },
            t2: {
              action: 'indices:data/read/search',
              running_time_in_nanos: 100_000_000,
              description: 'should be filtered out (too fast)'
            }
          }
        }
      }
    }
    const datasetsById = new Map([['ds-a', { id: 'ds-a', title: 'Dataset A', owner: { type: 'user', id: 'u', name: 'User' } }]])
    const out = mapLongTasks(tasksResponse as any, 1000, indicesPrefix, datasetsById)
    assert.equal(out.length, 1)
    assert.equal(out[0].action, 'indices:data/read/search')
    assert.equal(out[0].node, 'coordinator')
    assert.equal(out[0].runningTimeMs, 5000)
    assert.equal(out[0].targets.length, 1)
    assert.equal(out[0].targets[0].indexName, idxA)
    assert.equal(out[0].targets[0].datasetId, 'ds-a')
    assert.equal(out[0].targets[0].datasetTitle, 'Dataset A')
  })

  test('truncates very long descriptions to 500 chars', () => {
    const longDesc = 'x'.repeat(2000)
    const tasksResponse = {
      nodes: { n: { name: 'n', tasks: { t: { action: 'a', running_time_in_nanos: 2_000_000_000, description: longDesc } } } }
    }
    const out = mapLongTasks(tasksResponse as any, 1000, 'dataset-test', new Map())
    assert.equal(out[0].description.length, 500)
  })

  test('returns empty targets when no index parses out of description', () => {
    const tasksResponse = {
      nodes: { n: { name: 'n', tasks: { t: { action: 'a', running_time_in_nanos: 2_000_000_000, description: 'no index here' } } } }
    }
    const out = mapLongTasks(tasksResponse as any, 1000, 'dataset-test', new Map())
    assert.deepEqual(out[0].targets, [])
  })
})

test.describe('mapUnassignedShards', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 12)
  const idxA = `${indicesPrefix}-ds-a-${sha('ds-a')}`

  test('keeps only unassigned rows and resolves dataset', () => {
    const catRows = [
      { index: idxA, shard: '0', prirep: 'p', state: 'UNASSIGNED', 'unassigned.reason': 'NODE_LEFT' },
      { index: idxA, shard: '0', prirep: 'r', state: 'STARTED', 'unassigned.reason': '' }
    ]
    const datasetsById = new Map([['ds-a', { id: 'ds-a', title: 'A', owner: { type: 'user', id: 'u', name: 'User' } }]])
    const out = mapUnassignedShards(catRows as any, {}, indicesPrefix, datasetsById)
    assert.equal(out.length, 1)
    assert.equal(out[0].reason, 'NODE_LEFT')
    assert.equal(out[0].primary, true)
    assert.equal(out[0].datasetId, 'ds-a')
  })

  test('attaches allocation-explain details when present', () => {
    const catRows = [{ index: idxA, shard: '0', prirep: 'p', state: 'UNASSIGNED', 'unassigned.reason': 'ALLOCATION_FAILED' }]
    const explains = { [`${idxA}#0#p`]: 'cannot allocate because ...' }
    const out = mapUnassignedShards(catRows as any, explains, indicesPrefix, new Map())
    assert.equal(out[0].details, 'cannot allocate because ...')
  })

  test('returns null datasetId for foreign indices', () => {
    const catRows = [{ index: 'foreign-index', shard: '0', prirep: 'r', state: 'UNASSIGNED', 'unassigned.reason': 'NODE_LEFT' }]
    const out = mapUnassignedShards(catRows as any, {}, 'dataset-test', new Map())
    assert.equal(out[0].datasetId, null)
    assert.equal(out[0].primary, false)
  })
})

test.describe('mapIndicesSummary', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 12)

  test('sums totals and counts orphans', () => {
    const catRows = [
      { index: `${indicesPrefix}-a-${sha('a')}`, 'docs.count': '100', 'docs.deleted': '10', 'pri.store.size': '1000' },
      { index: `${indicesPrefix}-b-${sha('b')}`, 'docs.count': '200', 'docs.deleted': '0', 'pri.store.size': '2000' }
    ]
    const mongoIdsPresent = new Set(['a']) // 'b' is orphan
    const out = mapIndicesSummary(catRows as any, indicesPrefix, 42, mongoIdsPresent)
    assert.equal(out.nbDataFairIndices, 2)
    assert.equal(out.nbDatasetsWithIndex, 2)
    assert.equal(out.nbDatasetsInMongo, 42)
    assert.equal(out.totalDocs, 300)
    assert.equal(out.totalDeletedDocs, 10)
    assert.equal(out.totalPrimaryBytes, 3000)
    assert.ok(Math.abs(out.deletedRatio - (10 / 310)) < 1e-9)
    assert.equal(out.orphanIndicesCount, 1)
  })

  test('zero ratio when no docs', () => {
    const out = mapIndicesSummary([], indicesPrefix, 0, new Set())
    assert.equal(out.deletedRatio, 0)
    assert.equal(out.totalDocs, 0)
  })
})

test.describe('safeSection', () => {
  test('returns value and pushes nothing on success', async () => {
    const errors: any[] = []
    const v = await safeSection('cluster', async () => 42, errors)
    assert.equal(v, 42)
    assert.equal(errors.length, 0)
  })

  test('returns fallback and pushes error on failure', async () => {
    const errors: any[] = []
    const v = await safeSection('cluster', async () => { throw new Error('boom') }, errors, null)
    assert.equal(v, null)
    assert.deepEqual(errors[0], { section: 'cluster', message: 'boom' })
  })
})
