import { test, expect } from '@playwright/test'
import { axiosAuth, apiUrl, clean } from '../../support/axios.ts'
import { sendDataset, doAndWaitForFinalize, getRawDataset } from '../../support/workers.ts'
import { ensureIntegrityBucket, listIntegrityKeys, waitForIntegrityRevisions } from '../../support/integrity.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
// reset test-owned datasets + limit counters before each test (the shared suite convention); the
// integrity specs all run as the single test_superadmin, so without this their datasets accumulate
// and hit the dev nbDatasets quota. clean() spares dev_fixtures (owner.id !~ /^test_/).
test.beforeEach(async () => { await clean() })

// Wait until the historize relay has processed the flag (it clears _needsHistorizing when done),
// used to assert a *dedupe* no-op where no new revision is written.
const waitForFlagCleared = async (datasetId: string, timeoutMs = 20000) => {
  const start = Date.now()
  let raw = await getRawDataset(datasetId)
  while (raw._needsHistorizing !== undefined && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    raw = await getRawDataset(datasetId)
  }
  if (raw._needsHistorizing !== undefined) throw new Error('relay did not clear _needsHistorizing within timeout')
  return raw
}

test('relay writes a locked revision when _needsHistorizing is set, then dedupes', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`

  // simulate "integrity enabled" by flagging the doc directly (initial anchor)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    integrity: { active: true },
    _needsHistorizing: { classes: ['file'], context: { operation: 'enable', originator: 'test' } }
  })

  const keys = await waitForIntegrityRevisions(prefix, 1)
  expect(keys.length).toBe(1)
  const raw = await getRawDataset(dataset.id)
  expect(raw._needsHistorizing).toBeUndefined()
  expect(raw.integrity.file.lastRevision.hash.md5).toBe(dataset.originalFile.md5)

  // flag again without a file change → relay must dedupe (clears flag, writes no new revision)
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, { _needsHistorizing: { classes: ['file'] } })
  await waitForFlagCleared(dataset.id)
  expect((await listIntegrityKeys(prefix)).length).toBe(1)
})

test('relay clears the flag without writing a revision on a dataset without a file', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const ds = (await ax.post('/api/v1/datasets', { isRest: true, title: 'rest-relay', schema: [{ key: 'a', type: 'string' }] })).data
  const prefix = `data-fair/${ds.owner.type}-${ds.owner.id}/${ds.id}/file/`
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${ds.id}`, { _needsHistorizing: { classes: ['file'] } })
  await waitForFlagCleared(ds.id)
  expect((await listIntegrityKeys(prefix)).length).toBe(0)
})

test('a file replacement writes a new (second) revision', async () => {
  const ax = await axiosAuth('test_superadmin@test.com', undefined, true)
  const dataset = await sendDataset('datasets/dataset1.csv', ax)
  const prefix = `data-fair/${dataset.owner.type}-${dataset.owner.id}/${dataset.id}/file/`

  // establish the initial anchor (revision 0) for dataset1.csv
  await ax.post(`${apiUrl}/api/v1/test-env/patch-dataset/${dataset.id}`, {
    integrity: { active: true },
    _needsHistorizing: { classes: ['file'] }
  })
  expect((await waitForIntegrityRevisions(prefix, 1)).length).toBe(1)

  // replace the file; the finalize hook sets _needsHistorizing because integrity.active is true,
  // and the new md5 (dataset2.csv) differs from the anchor → relay writes revision 1.
  await doAndWaitForFinalize(ax, dataset.id, async () => {
    const FormData = (await import('form-data')).default
    const fs = (await import('fs-extra')).default
    const path = (await import('node:path')).default
    const form = new FormData()
    form.append('file', fs.readFileSync(path.resolve('./tests/resources/datasets/dataset2.csv')), 'dataset1.csv')
    await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: form.getHeaders() })
  })

  const keys = await waitForIntegrityRevisions(prefix, 2)
  expect(keys.length).toBe(2)
})
