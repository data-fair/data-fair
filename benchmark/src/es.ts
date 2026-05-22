import { Client } from '@elastic/elasticsearch'

/** data-fair names a dataset's alias `${indicesPrefix}-${datasetId}` (see commons.js aliasName). */
export function aliasName (indicesPrefix: string, datasetId: string): string {
  return `${indicesPrefix}-${datasetId}`
}

// The dev-benchmark API runs with NODE_ENV=benchmark, so indicesPrefix is `dataset-benchmark`
// (api/config/default.cjs: `indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development')`).
const esNode = (process.env.ES_NODES || process.env.BENCHMARK_ES_NODES || 'http://localhost:9200').split(',')[0]
const indicesPrefix = process.env.BENCHMARK_INDICES_PREFIX || 'dataset-benchmark'

let client: Client | undefined

export function getEsClient (): Client {
  if (!client) client = new Client({ node: esNode })
  return client
}

/**
 * Resolve the ES index/alias backing a data-fair dataset. Tries the deterministic name
 * first, then falls back to scanning aliases (covers an unexpected indices prefix).
 */
export async function resolveIndex (datasetId: string): Promise<string> {
  const es = getEsClient()
  const candidate = aliasName(indicesPrefix, datasetId)
  const exists = await es.indices.existsAlias({ name: candidate }).catch(() => false)
  if (exists) return candidate
  const aliases = await es.cat.aliases({ format: 'json' }) as Array<{ alias?: string }>
  const match = aliases.find(a => a.alias === candidate || a.alias?.endsWith(`-${datasetId}`))
  if (!match?.alias) throw new Error(`no ES alias for dataset "${datasetId}" — is it seeded & finalized?`)
  return match.alias
}

/**
 * Create a faithful N-shard copy of an index (mappings copied verbatim) via _reindex,
 * for sharding-sensitivity experiments. Idempotent — returns an existing copy as-is.
 * The runner clears caches inline via `es.indices.clearCache` for its --cold mode.
 */
export async function reindexWithShards (sourceIndex: string, shards: number): Promise<string> {
  const es = getEsClient()
  const target = `${sourceIndex}-shards${shards}`
  if (await es.indices.exists({ index: target })) return target
  const got = await es.indices.get({ index: sourceIndex })
  const sourceDef = Object.values(got)[0]
  await es.indices.create({
    index: target,
    settings: { number_of_shards: shards, number_of_replicas: 0 },
    mappings: sourceDef.mappings
  })
  await es.reindex({
    source: { index: sourceIndex },
    dest: { index: target },
    refresh: true,
    wait_for_completion: true
  })
  return target
}
