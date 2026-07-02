import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize, waitForDatasetError } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const fetchDiagnostic = (id: string) =>
  testUser1.get(`/api/v1/datasets/${id}/validation-diagnostic.csv`, { responseType: 'text', validateStatus: () => true })
const findEvent = async (id: string, type: string) =>
  (await testUser1.get(`/api/v1/datasets/${id}/journal`)).data.find((e: any) => e.type === type)

const upload = async (csv: string, constraints: any[]) => {
  const form = new FormData()
  form.append('file', Buffer.from(csv), 'data.csv')
  form.append('schema', JSON.stringify([{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }]))
  form.append('constraints', JSON.stringify(constraints))
  return (await testUser1.post('/api/v1/datasets', form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })).data
}

test.describe('file dataset unique constraint', () => {
  test.beforeEach(async () => { await clean() })

  test('a duplicate multi-column key blocks the dataset and lists the rows', async () => {
    // The diagnostic `line` column is the 1-based DATA-row index (`_i`),
    // header excluded — see the existing validation-diagnostic spec.
    const csv = 'a,b\n' + [
      'x,1',  // data row 1
      'y,2',  // data row 2
      'x,1',  // data row 3  <- duplicate of data row 1
      'z,3'   // data row 4
    ].join('\n') + '\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.unicityErrorCount ?? 0) > 0, 'expected unicityErrorCount > 0')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    for (const r of rows.slice(1)) assert.match(r, /,unicity,/)
    const lineNumbers = rows.slice(1).map((r: string) => Number(r.split(',')[0])).sort()
    assert.deepEqual(lineNumbers, [1, 3])
  })

  test('a dataset with no duplicates finalizes normally', async () => {
    const csv = 'a,b\nx,1\ny,2\nz,3\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')
    assert.equal((await fetchDiagnostic(ds.id)).status, 404)
  })
})
