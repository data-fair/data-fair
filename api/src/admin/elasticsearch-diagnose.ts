// Pure shape mappers + small async wrapper. No ES / Mongo / node-config imports here.

import { parseIndexName } from '../datasets/es/index-name.ts'

export type Watermark = 'ok' | 'low' | 'high' | 'flood' | null

export type DatasetRef = {
  id: string
  title: string
  owner: { type: string, id: string, name: string }
}

export type SectionError = { section: string, message: string }

export type ClusterSummary = {
  name: string
  status: 'green' | 'yellow' | 'red' | string
  numberOfNodes: number
  numberOfDataNodes: number
  activePrimaryShards: number
  activeShards: number
  relocatingShards: number
  initializingShards: number
  unassignedShards: number
  pendingTasks: { count: number, maxAgeMs: number | null }
}

export type NodeSummary = {
  id: string
  name: string
  roles: string[]
  isDataNode: boolean
  heapUsedPct: number | null
  cpuPct: number | null
  load1m: number | null
  disk: {
    usedBytes: number | null
    totalBytes: number | null
    usedPct: number | null
    watermark: Watermark
  }
  shardCount: number | null
  breakers: Record<string, { tripped: number }>
  threadPoolsOfInterest: Array<{ name: string, active: number, queue: number, rejected: number }>
  indexingPressure: { currentCombinedBytes: number, currentPrimaryBytes: number, currentCoordinatingBytes: number } | null
}

export type LongTaskCategory = 'search' | 'write' | 'admin' | 'other'

export type LongTask = {
  id: string
  node: string
  action: string
  category: LongTaskCategory
  runningTimeMs: number
  description: string
  sourceQuery: object | null
  sourceQueryOversized: boolean
  targets: Array<{
    indexName: string
    datasetId: string | null
    datasetTitle: string | null
    datasetOwner: { type: string, id: string, name: string } | null
  }>
}

export type UnassignedShard = {
  index: string
  shard: number
  primary: boolean
  reason: string
  details: string | null
  datasetId: string | null
  datasetTitle: string | null
  datasetOwner: { type: string, id: string, name: string } | null
}

export type IndicesSummary = {
  nbDataFairIndices: number
  nbDatasetsWithIndex: number
  nbDatasetsInMongo: number
  totalDocs: number
  totalPrimaryBytes: number
  totalDeletedDocs: number
  deletedRatio: number
  orphanIndicesCount: number
}

export const resolveWatermark = (
  usedPct: number | null,
  lowPct: number,
  highPct: number,
  floodPct: number
): Watermark => {
  if (usedPct == null) return null
  if (usedPct >= floodPct) return 'flood'
  if (usedPct >= highPct) return 'high'
  if (usedPct >= lowPct) return 'low'
  return 'ok'
}

export const mapClusterHealth = (
  health: any,
  pendingTasks: Array<{ time_in_queue_millis?: number }>
): ClusterSummary => {
  const ageList = (pendingTasks ?? []).map(t => Number(t.time_in_queue_millis ?? 0))
  return {
    name: health.cluster_name,
    status: health.status,
    numberOfNodes: health.number_of_nodes ?? 0,
    numberOfDataNodes: health.number_of_data_nodes ?? 0,
    activePrimaryShards: health.active_primary_shards ?? 0,
    activeShards: health.active_shards ?? 0,
    relocatingShards: health.relocating_shards ?? 0,
    initializingShards: health.initializing_shards ?? 0,
    unassignedShards: health.unassigned_shards ?? 0,
    pendingTasks: {
      count: (pendingTasks ?? []).length,
      maxAgeMs: ageList.length ? Math.max(...ageList) : null
    }
  }
}

const dataRoleRe = /^data(_|$)/
const isDataRole = (role: string) => dataRoleRe.test(role)

export const mapNodes = (
  nodesStats: any,
  watermarks: { lowPct: number, highPct: number, floodPct: number },
  shardsByNode: Map<string, number>
): NodeSummary[] => {
  const result: NodeSummary[] = []
  for (const [id, raw] of Object.entries<any>(nodesStats?.nodes ?? {})) {
    const roles: string[] = raw.roles ?? []
    const fsData: any[] = raw.fs?.data ?? []
    let totalBytes: number | null = null
    let availBytes: number | null = null
    if (fsData.length) {
      totalBytes = 0
      availBytes = 0
      for (const d of fsData) {
        totalBytes += Number(d.total_in_bytes ?? 0)
        availBytes += Number(d.available_in_bytes ?? 0)
      }
    }
    const usedBytes = (totalBytes != null && availBytes != null) ? totalBytes - availBytes : null
    const usedPct = (totalBytes && usedBytes != null) ? (usedBytes / totalBytes) * 100 : null

    // only surface breakers that have tripped — untripped breakers are noise on the UI
    const breakers: Record<string, { tripped: number }> = {}
    for (const [bName, b] of Object.entries<any>(raw.breakers ?? {})) {
      const tripped = Number(b.tripped ?? 0)
      if (tripped > 0) breakers[bName] = { tripped }
    }

    const tpList: Array<{ name: string, active: number, queue: number, rejected: number }> = []
    for (const [tpName, tp] of Object.entries<any>(raw.thread_pool ?? {})) {
      const queue = Number(tp.queue ?? 0)
      const rejected = Number(tp.rejected ?? 0)
      if (queue > 0 || rejected > 0) {
        tpList.push({ name: tpName, active: Number(tp.active ?? 0), queue, rejected })
      }
    }
    tpList.sort((a, b) => (b.rejected - a.rejected) || (b.queue - a.queue))
    const threadPoolsOfInterest = tpList.slice(0, 10)

    const pressure = raw.indexing_pressure?.memory?.current
    const indexingPressure = pressure
      ? {
          currentCombinedBytes: Number(pressure.combined_coordinating_and_primary_in_bytes ?? 0),
          currentPrimaryBytes: Number(pressure.primary_in_bytes ?? 0),
          currentCoordinatingBytes: Number(pressure.coordinating_in_bytes ?? 0)
        }
      : null

    result.push({
      id,
      name: raw.name,
      roles,
      isDataNode: roles.some(isDataRole),
      heapUsedPct: raw.jvm?.mem?.heap_used_percent ?? null,
      cpuPct: raw.os?.cpu?.percent ?? null,
      load1m: raw.os?.cpu?.load_average?.['1m'] ?? null,
      disk: {
        usedBytes,
        totalBytes,
        usedPct,
        watermark: resolveWatermark(usedPct, watermarks.lowPct, watermarks.highPct, watermarks.floodPct)
      },
      shardCount: shardsByNode.get(raw.name) ?? null,
      breakers,
      threadPoolsOfInterest,
      indexingPressure
    })
  }
  return result
}

export const categorizeTaskAction = (action: string): LongTaskCategory => {
  if (action.startsWith('indices:data/read/')) return 'search'
  if (action.startsWith('indices:data/write/')) return 'write'
  if (
    action.startsWith('indices:admin/') ||
    action.startsWith('cluster:') ||
    action.startsWith('internal:')
  ) return 'admin'
  return 'other'
}

export type ExtractedSourceQuery = {
  sourceQuery: object | null
  sourceQueryOversized: boolean
}

const NONE: ExtractedSourceQuery = { sourceQuery: null, sourceQueryOversized: false }

export const extractSourceQuery = (description: string, maxChars: number): ExtractedSourceQuery => {
  if (!description) return NONE
  const head = 'source['
  const start = description.indexOf(head)
  if (start === -1) return NONE
  const innerStart = start + head.length
  let depth = 0
  let inString = false
  let escape = false
  let i = innerStart
  let foundOpen = false
  for (; i < description.length; i++) {
    const ch = description[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { depth++; foundOpen = true; continue }
    if (ch === '}') {
      depth--
      if (depth < 0) return NONE
      continue
    }
    if (ch === ']' && depth === 0) {
      if (!foundOpen) return NONE
      break
    }
  }
  if (i >= description.length || depth !== 0) return NONE
  const inner = description.slice(innerStart, i)
  if (inner.length > maxChars) return { sourceQuery: null, sourceQueryOversized: true }
  try {
    const parsed = JSON.parse(inner)
    if (parsed && typeof parsed === 'object') return { sourceQuery: parsed, sourceQueryOversized: false }
    return NONE
  } catch {
    return NONE
  }
}

const MAX_SOURCE_QUERY_CHARS = 50_000

// Tokens used to find data-fair index names embedded inside an ES task description.
// Hyphens are part of the index name; ":" is intentionally NOT in the class — ES remote-cluster
// syntax `cluster:index` would split here, yielding `index` only. That's a known limitation;
// data-fair does not use remote clusters in any current deployment.
const INDEX_TOKEN_RE = /[a-zA-Z0-9_.-]+/g

export const extractIndexNames = (description: string, indicesPrefix: string): string[] => {
  if (!description) return []
  const head = `${indicesPrefix}-`
  const found = new Set<string>()
  const tokens = description.match(INDEX_TOKEN_RE) ?? []
  for (const tok of tokens) {
    if (tok.startsWith(head)) found.add(tok)
  }
  return [...found]
}

export const mapLongTasks = (
  tasksResponse: any,
  longTaskMs: number,
  indicesPrefix: string,
  datasetsById: Map<string, DatasetRef>
): LongTask[] => {
  const out: LongTask[] = []
  for (const [, nodeBlock] of Object.entries<any>(tasksResponse?.nodes ?? {})) {
    const nodeName: string = nodeBlock.name
    for (const [taskId, task] of Object.entries<any>(nodeBlock.tasks ?? {})) {
      const runningMs = Number(task.running_time_in_nanos ?? 0) / 1e6
      if (runningMs <= longTaskMs) continue
      const rawDesc: string = task.description ?? ''
      const description = rawDesc.length > 500 ? rawDesc.slice(0, 500) : rawDesc
      const category = categorizeTaskAction(task.action)
      const { sourceQuery, sourceQueryOversized } = category === 'search'
        ? extractSourceQuery(rawDesc, MAX_SOURCE_QUERY_CHARS)
        : { sourceQuery: null, sourceQueryOversized: false }
      const indexNames = extractIndexNames(rawDesc, indicesPrefix)
      const targets = indexNames.map(indexName => {
        const datasetId = parseIndexName(indexName, indicesPrefix)
        const ref = datasetId ? datasetsById.get(datasetId) ?? null : null
        return {
          indexName,
          datasetId,
          datasetTitle: ref?.title ?? null,
          datasetOwner: ref?.owner ?? null
        }
      })
      out.push({
        id: taskId,
        node: nodeName,
        action: task.action,
        category,
        runningTimeMs: runningMs,
        description,
        sourceQuery,
        sourceQueryOversized,
        targets
      })
    }
  }
  out.sort((a, b) => b.runningTimeMs - a.runningTimeMs)
  return out
}

export const mapUnassignedShards = (
  catRows: any[],
  explainByKey: Record<string, string>,
  indicesPrefix: string,
  datasetsById: Map<string, DatasetRef>
): UnassignedShard[] => {
  const out: UnassignedShard[] = []
  for (const row of catRows ?? []) {
    if (row.state !== 'UNASSIGNED') continue
    const indexName = row.index
    const shard = Number(row.shard)
    const primary = row.prirep === 'p'
    const datasetId = parseIndexName(indexName, indicesPrefix)
    const ref = datasetId ? datasetsById.get(datasetId) ?? null : null
    const key = `${indexName}#${shard}#${row.prirep}`
    out.push({
      index: indexName,
      shard,
      primary,
      reason: row['unassigned.reason'] ?? 'UNKNOWN',
      details: explainByKey[key] ?? null,
      datasetId,
      datasetTitle: ref?.title ?? null,
      datasetOwner: ref?.owner ?? null
    })
  }
  return out
}

export const mapIndicesSummary = (
  catRows: any[],
  indicesPrefix: string,
  nbDatasetsInMongo: number,
  mongoDatasetIds: Set<string>
): IndicesSummary => {
  let totalDocs = 0
  let totalDeletedDocs = 0
  let totalPrimaryBytes = 0
  const datasetIds = new Set<string>()
  let orphanIndicesCount = 0
  for (const row of catRows ?? []) {
    totalDocs += Number(row['docs.count'] ?? 0)
    totalDeletedDocs += Number(row['docs.deleted'] ?? 0)
    totalPrimaryBytes += Number(row['pri.store.size'] ?? 0)
    const datasetId = parseIndexName(row.index, indicesPrefix)
    if (datasetId) {
      datasetIds.add(datasetId)
      if (!mongoDatasetIds.has(datasetId)) orphanIndicesCount += 1
    }
  }
  const denom = totalDocs + totalDeletedDocs
  return {
    nbDataFairIndices: (catRows ?? []).length,
    nbDatasetsWithIndex: datasetIds.size,
    nbDatasetsInMongo,
    totalDocs,
    totalPrimaryBytes,
    totalDeletedDocs,
    deletedRatio: denom > 0 ? totalDeletedDocs / denom : 0,
    orphanIndicesCount
  }
}

export const safeSection = async <T>(
  section: string,
  fn: () => Promise<T>,
  errors: SectionError[],
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    errors.push({ section, message: (err as Error).message ?? String(err) })
    return fallback
  }
}
