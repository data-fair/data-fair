import { getAxios } from './setup.ts'
import { generateSchema, rowIterator, type DatasetSpec } from './generator.ts'

const BATCH_SIZE = 1000
const FINALIZE_TIMEOUT_S = 1800

/** Seed a dataset via data-fair (so the ES mapping is real). Idempotent. */
export async function seedDataset (spec: DatasetSpec): Promise<void> {
  const ax = getAxios()

  let existing: { status?: string, count?: number } | undefined
  try {
    const res = await ax.get(`/api/v1/datasets/${spec.id}`)
    existing = res.data
  } catch (err: any) {
    const status = err.response?.status ?? err.status
    if (status !== 404) throw err
    // 404 — dataset does not exist yet, fall through to create it
  }

  if (existing) {
    if (existing.status === 'finalized' && (existing.count ?? 0) >= spec.rows) {
      console.log(`[seed] ${spec.id} already finalized (${existing.count} rows), skipping`)
      return
    }
    if (existing.status !== 'finalized' && existing.status !== 'error') {
      throw new Error(`[seed] ${spec.id} exists with status "${existing.status}" — wait for it to finalize or delete it first`)
    }
    // 'finalized' but too few rows, or 'error' — fall through to re-create
  }

  console.log(`[seed] creating ${spec.id} (${spec.rows.toLocaleString()} rows)...`)
  await ax.put(`/api/v1/datasets/${spec.id}`, {
    isRest: true,
    title: spec.id,
    schema: generateSchema(spec)
  })

  let batch: Record<string, unknown>[] = []
  let sent = 0
  const flush = async () => {
    if (batch.length === 0) return
    await ax.post(`/api/v1/datasets/${spec.id}/_bulk_lines`, batch)
    sent += batch.length
    if (sent % 50_000 === 0 || sent >= spec.rows) {
      console.log(`[seed] ${spec.id}: ${sent.toLocaleString()}/${spec.rows.toLocaleString()} rows`)
    }
    batch = []
  }
  for (const row of rowIterator(spec)) {
    batch.push(row)
    if (batch.length >= BATCH_SIZE) await flush()
  }
  await flush()

  console.log(`[seed] ${spec.id}: waiting for finalization...`)
  for (let attempt = 0; attempt < FINALIZE_TIMEOUT_S; attempt++) {
    const res = await ax.get(`/api/v1/datasets/${spec.id}`)
    // a REST dataset flips to status 'finalized' while its worker is still indexing the
    // backlog of bulk batches — the row count must also clear spec.rows before the seed
    // is genuinely complete, otherwise experiments run against a half-filled index
    if (res.data.status === 'finalized' && (res.data.count ?? 0) >= spec.rows) {
      console.log(`[seed] ${spec.id} ready (${(res.data.count ?? 0).toLocaleString()} rows)`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`${spec.id} did not finalize within ${FINALIZE_TIMEOUT_S}s`)
}
