import './env.ts'
import { Client } from '@elastic/elasticsearch'

/** data-fair names a dataset's alias `${indicesPrefix}-${datasetId}` (see commons.js aliasName). */
export function aliasName (indicesPrefix: string, datasetId: string): string {
  return `${indicesPrefix}-${datasetId}`
}

/**
 * Resolve a single ES node URL. Explicit BENCHMARK_ES_NODES / ES_NODES win
 * (tolerating a JSON-array value, this repo's env format); otherwise derive from
 * the repo .env ES_PORT (loaded by ./env.ts).
 */
function resolveEsNode (): string {
  const explicit = (process.env.BENCHMARK_ES_NODES || process.env.ES_NODES || '').trim()
  if (explicit) {
    if (explicit.startsWith('[')) {
      try {
        const arr: unknown = JSON.parse(explicit)
        if (Array.isArray(arr) && arr.length > 0) return String(arr[0])
      } catch { /* not valid JSON — fall through to comma split */ }
    }
    return explicit.split(',')[0]
  }
  if (process.env.ES_PORT) return `http://localhost:${process.env.ES_PORT}`
  return 'http://localhost:9200'
}

const esNode = resolveEsNode()
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
