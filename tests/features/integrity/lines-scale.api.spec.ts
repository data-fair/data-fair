// Opt-in measurement for the lines gate (design 2026-10-15 §6) — NOT part of the normal suite.
// Run: INTEGRITY_SCALE_LINES=1000000 INTEGRITY_SCALE_API_PID=<dev-api node pid> \
//   npx playwright test --project=api tests/features/integrity/lines-scale.api.spec.ts
// Records wall times and the API process peak RSS (sampled from /proc). Request counts follow
// from the sizes: LIST pages ≈ versions/1000, $in lookups ≈ lines/1000.
import { test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { axiosAuth, apiUrl, anonymousAx } from '../../support/axios.ts'
import { ensureIntegrityBucket, waitForLinesDrained } from '../../support/integrity.ts'

const LINES = Number(process.env.INTEGRITY_SCALE_LINES ?? 0)
const PID = process.env.INTEGRITY_SCALE_API_PID
test.skip(!LINES, 'set INTEGRITY_SCALE_LINES to run the integrity scale measurement')

const rssMB = async () => {
  if (!PID) return NaN
  const status = await readFile(`/proc/${PID}/status`, 'utf8')
  return Math.round(Number(/VmRSS:\s+(\d+)/.exec(status)![1]) / 1024)
}
const measure = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  let peak = await rssMB()
  const base = peak
  const sampler = setInterval(async () => { peak = Math.max(peak, await rssMB()) }, 500)
  const t0 = Date.now()
  try { return await fn() } finally {
    clearInterval(sampler)
    console.log(JSON.stringify({ label, lines: LINES, seconds: Math.round((Date.now() - t0) / 1000), rssBaseMB: base, rssPeakMB: peak }))
  }
}
const waitCheckAfter = async (ax: any, id: string, since: string) => {
  while (true) {
    const state = (await ax.get(`/api/v1/datasets/${id}/_integrity`)).data
    if (!state.running && state.lastCheck?.date > since) return state
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

const setConfig = (path: string, value: any) => anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path, value })

test('lines integrity at scale', async () => {
  test.setTimeout(6 * 3600 * 1000)
  await ensureIntegrityBucket()
  // the dev config caps storage at a few hundred KB: lift it for the run, restore the dev values after
  await setConfig('integrity.lines.maxLines', LINES)
  await setConfig('defaultLimits.totalStorage', -1)
  await setConfig('defaultLimits.datasetStorage', -1)
  try {
    await run()
  } finally {
    await setConfig('integrity.lines.maxLines', 100000)
    await setConfig('defaultLimits.totalStorage', 200000)
    await setConfig('defaultLimits.datasetStorage', 160000)
  }
})

const run = async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: `integrity scale ${LINES}`, schema: [{ key: 'label', type: 'string' }, { key: 'n', type: 'integer' }] })).data
  await measure('seed', async () => {
    for (let offset = 0; offset < LINES; offset += 10000) {
      const chunk = Array.from({ length: Math.min(10000, LINES - offset) }, (_, n) => ({ label: `line ${offset + n}`, n: offset + n }))
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, chunk)
    }
  })
  await measure('enable+backfill', async () => {
    await ax.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
    await waitForLinesDrained(dataset.id, 6 * 3600 * 1000)
  })
  // churn: a second revision on 10% of the lines
  await measure('churn', async () => {
    const ids = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { size: 10000, select: '_id' } })).data.results.map((r: any) => r._id)
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, ids.map((_id: string) => ({ _action: 'patch', _id, label: 'churned' })))
    await waitForLinesDrained(dataset.id, 3600 * 1000)
  })
  for (const label of ['check', 'check (renewal due)']) {
    if (label === 'check (renewal due)') {
      await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { 'integrity.linesRenewal.retainUntil': new Date(Date.now() + 3600 * 1000).toISOString() })
      await anonymousAx.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
    }
    await measure(label, async () => {
      const since = new Date().toISOString()
      const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_check`)
      const state = res.status === 202 ? await waitCheckAfter(ax, dataset.id, since) : res.data
      const hot = (await ax.get(`/api/v1/datasets/${dataset.id}/_integrity`)).data
      console.log(JSON.stringify({ label, verdict: state.lastCheck?.status ?? state.status, linesRenewal: hot.linesRenewal }))
    })
  }
  // the other daily walks over the same data (design §5): O(objects) time, constant memory.
  // Both are bucket-wide, so on a shared dev bucket the figures include other test data.
  await measure('storage measurement', () => anonymousAx.post(`${apiUrl}/api/v1/test-env/integrity-storage/run`))
  await measure('purge', () => anonymousAx.post(`${apiUrl}/api/v1/test-env/integrity-purge/run`))
  // one tampered line, then _fix through the 202 path
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${dataset.id}`, { filter: { n: 42 }, update: { $set: { label: 'tampered' } } })
  await measure('_fix one line', async () => {
    const since = new Date().toISOString()
    const res = await ax.post(`/api/v1/datasets/${dataset.id}/_integrity/_fix`)
    const state = res.status === 202 ? await waitCheckAfter(ax, dataset.id, since) : res.data
    console.log(JSON.stringify({ label: '_fix one line', verdict: state.lastCheck?.status ?? state.status }))
  })
}
