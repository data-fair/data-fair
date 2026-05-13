import config from '#config'
import es from '#es'
import mongo from '#mongo'
import memoize from 'memoizee'
import { parseIndexName } from '../datasets/es/index-name.js'
import {
  mapClusterHealth,
  mapNodes,
  mapLongTasks,
  mapUnassignedShards,
  mapIndicesSummary,
  safeSection,
  type SectionError,
  type DatasetRef
} from './elasticsearch-diagnose.ts'
import { listDatasetsWithEsWarnings } from './service.ts'

// Watermarks rarely change; refresh once a minute.
const DEFAULT_LOW = 85
const DEFAULT_HIGH = 90
const DEFAULT_FLOOD = 95

const parsePct = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback
  // ES accepts "85%" (percentage of disk) or absolute "10gb" (absolute free space).
  // We only handle percent values here — falling back to defaults for absolute values
  // is fine; the dashboard chip is informational, not a precise threshold check.
  if (raw.endsWith('%')) return Number(raw.slice(0, -1))
  return fallback
}

const _getWatermarks = async (): Promise<{ lowPct: number, highPct: number, floodPct: number }> => {
  const s = await es.client.cluster.getSettings({ include_defaults: true, flat_settings: true })
  const get = (key: string): string | undefined =>
    (s.persistent as any)?.[key] ?? (s.transient as any)?.[key] ?? (s.defaults as any)?.[key]
  return {
    lowPct: parsePct(get('cluster.routing.allocation.disk.watermark.low'), DEFAULT_LOW),
    highPct: parsePct(get('cluster.routing.allocation.disk.watermark.high'), DEFAULT_HIGH),
    floodPct: parsePct(get('cluster.routing.allocation.disk.watermark.flood_stage'), DEFAULT_FLOOD)
  }
}
const getWatermarks = memoize(_getWatermarks, { promise: true, maxAge: 60_000 })

const countShardsByNode = (catShardsRows: any[]): Map<string, number> => {
  const m = new Map<string, number>()
  for (const r of catShardsRows ?? []) {
    const node = r.node
    if (!node || node === 'UNASSIGNED' || node === '') continue
    m.set(node, (m.get(node) ?? 0) + 1)
  }
  return m
}

const INDEX_TOKEN_RE = /[a-zA-Z0-9_.-]+/g

const collectReferencedDatasetIds = (
  catShardsRows: any[],
  catIndicesRows: any[],
  tasksResponse: any,
  indicesPrefix: string
): Set<string> => {
  const ids = new Set<string>()
  for (const r of catShardsRows ?? []) {
    const id = parseIndexName(r.index, indicesPrefix)
    if (id) ids.add(id)
  }
  for (const r of catIndicesRows ?? []) {
    const id = parseIndexName(r.index, indicesPrefix)
    if (id) ids.add(id)
  }
  // tasks-list descriptions: parse out any prefix-prefixed tokens
  const head = `${indicesPrefix}-`
  for (const [, nodeBlock] of Object.entries<any>(tasksResponse?.nodes ?? {})) {
    for (const [, task] of Object.entries<any>(nodeBlock.tasks ?? {})) {
      const desc: string = task.description ?? ''
      for (const tok of desc.match(INDEX_TOKEN_RE) ?? []) {
        if (tok.startsWith(head)) {
          const id = parseIndexName(tok, indicesPrefix)
          if (id) ids.add(id)
        }
      }
    }
  }
  return ids
}

const fetchDatasetsById = async (ids: Set<string>): Promise<Map<string, DatasetRef>> => {
  const m = new Map<string, DatasetRef>()
  if (ids.size === 0) return m
  const rows = await mongo.db.collection('datasets')
    .find({ id: { $in: [...ids] } }, { projection: { _id: 0, id: 1, title: 1, owner: 1 } })
    .toArray()
  for (const r of rows as any[]) m.set(r.id, { id: r.id, title: r.title, owner: r.owner })
  return m
}

export const getElasticsearchDiagnose = async () => {
  const errors: SectionError[] = []
  const indicesPrefix: string = config.indicesPrefix
  const longTaskMs: number = config.elasticsearch.diagnose.longTaskMs
  const explainCap: number = config.elasticsearch.diagnose.unassignedExplainCap

  const [
    health, pendingTasks, watermarks,
    nodesStats, catShards, catIndices, tasksResponse,
    datasetsWithEsWarnings, nbDatasetsInMongo
  ] = await Promise.all([
    safeSection('cluster.health', () => es.client.cluster.health(), errors, null as any),
    safeSection('cluster.pendingTasks', async () => (await es.client.cluster.pendingTasks()).tasks ?? [], errors, [] as any[]),
    safeSection('cluster.watermarks', () => getWatermarks(), errors, { lowPct: DEFAULT_LOW, highPct: DEFAULT_HIGH, floodPct: DEFAULT_FLOOD }),
    safeSection('nodes.stats', () => es.client.nodes.stats({
      metric: ['os', 'jvm', 'fs', 'thread_pool', 'breaker', 'indexing_pressure']
    }), errors, { nodes: {} } as any),
    safeSection('cat.shards', () => es.client.cat.shards({
      format: 'json',
      h: 'index,shard,prirep,state,unassigned.reason,node'
    }), errors, [] as any[]),
    safeSection('cat.indices', () => es.client.cat.indices({
      index: `${indicesPrefix}-*`,
      format: 'json',
      bytes: 'b',
      h: 'index,docs.count,docs.deleted,pri.store.size'
    }), errors, [] as any[]),
    safeSection('tasks.list', () => es.client.tasks.list({ detailed: true, group_by: 'none' as any }), errors, { nodes: {} } as any),
    safeSection('datasetsWithEsWarnings', () => listDatasetsWithEsWarnings(1000), errors, { count: 0, results: [] }),
    safeSection('mongo.countDatasets', () => mongo.db.collection('datasets').countDocuments({
      isVirtual: { $ne: true },
      isMetaOnly: { $ne: true }
    }), errors, 0)
  ])

  const referencedIds = collectReferencedDatasetIds(
    catShards as any[],
    catIndices as any[],
    tasksResponse,
    indicesPrefix
  )
  const datasetsById = await safeSection(
    'mongo.datasets',
    () => fetchDatasetsById(referencedIds),
    errors,
    new Map<string, DatasetRef>()
  ) as Map<string, DatasetRef>

  // Allocation-explain for unassigned shards, capped.
  const explainByKey: Record<string, string> = {}
  const unassignedRows: any[] = (catShards as any[]).filter(r => r.state === 'UNASSIGNED')
  if (unassignedRows.length > 0 && unassignedRows.length <= explainCap) {
    await Promise.all(unassignedRows.map(async row => {
      const indexName = row.index
      const shard = Number(row.shard)
      const primary = row.prirep === 'p'
      const key = `${indexName}#${shard}#${row.prirep}`
      const text = await safeSection(`allocationExplain:${key}`, async () => {
        const r: any = await es.client.cluster.allocationExplain({ index: indexName, shard, primary } as any)
        return r.note ?? JSON.stringify(r.allocate_explanation ?? r).slice(0, 1000)
      }, errors, null)
      if (text) explainByKey[key] = text
    }))
  }

  const mongoIdsPresent = new Set<string>(datasetsById.keys())

  return {
    cluster: health ? mapClusterHealth(health, pendingTasks as any[]) : null,
    nodes: mapNodes(nodesStats as any, watermarks as any, countShardsByNode(catShards as any)),
    longTasks: mapLongTasks(tasksResponse as any, longTaskMs, indicesPrefix, datasetsById),
    unassignedShards: mapUnassignedShards(catShards as any[], explainByKey, indicesPrefix, datasetsById),
    indicesSummary: mapIndicesSummary(catIndices as any[], indicesPrefix, nbDatasetsInMongo as number, mongoIdsPresent),
    datasetsWithEsWarnings,
    errors
  }
}
