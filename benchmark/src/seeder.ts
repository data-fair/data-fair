import { getAxios } from './setup.ts'
import { generateSchema, rowIterator, type DatasetSpec } from './generator.ts'

const BATCH_SIZE = 1000
const FINALIZE_TIMEOUT_S = 1800

/** Seed a dataset via data-fair (so the ES mapping is real). Idempotent. */
export async function seedDataset (spec: DatasetSpec): Promise<void> {
  const ax = getAxios()

  try {
    const res = await ax.get(`/api/v1/datasets/${spec.id}`)
    if (res.data.status === 'finalized' && res.data.count >= spec.rows) {
      console.log(`[seed] ${spec.id} already finalized (${res.data.count} rows), skipping`)
      return
    }
  } catch { /* dataset does not exist yet — create it below */ }

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
    if (res.data.status === 'finalized') {
      console.log(`[seed] ${spec.id} ready`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`${spec.id} did not finalize within ${FINALIZE_TIMEOUT_S}s`)
}
