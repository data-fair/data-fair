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

const conceptSchema = [
  { key: 'deb', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/startDate', title: 'Début' },
  { key: 'fin', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/endDate', title: 'Fin' }
]

const upload = async (id: string, csv: string, constraints?: any[]) => {
  const form = new FormData()
  form.append('file', Buffer.from(csv), 'data.csv')
  form.append('schema', JSON.stringify(conceptSchema))
  if (constraints) form.append('constraints', JSON.stringify(constraints))
  return (await testUser1.post(`/api/v1/datasets/${id}`, form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })).data
}

test.describe('file dataset dateCoherence constraint', () => {
  test.beforeEach(async () => { await clean() })

  test('an incoherent row blocks the dataset and lands in the diagnostic CSV', async () => {
    const csv = 'deb,fin\n' + [
      '2024-05-01,2024-05-02', // data row 1: ok
      '2024-05-03,2024-05-01', // data row 2: violation
      '2024-05-04,2024-05-04', // data row 3: equality, ok
      '2024-05-05,'            // data row 4: open-ended, ok
    ].join('\n') + '\n'
    const ds = await upload('file-coherence-ko', csv, [{ type: 'dateCoherence' }])
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.validationErrorCount ?? 0) > 0, 'coherence errors count as validation errors')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    assert.equal(rows.length, 2) // exactly one bad row
    assert.match(rows[1], /^2,validation,fin,/)
    assert.match(rows[1], /Incohérence de dates/)
    assert.match(rows[1], /Fin.*2024-05-01/)
    assert.match(rows[1], /Début.*2024-05-03/)
  })

  test('a coherent file finalizes; the same data without the constraint also finalizes', async () => {
    const okCsv = 'deb,fin\n2024-05-01,2024-05-02\n2024-05-03,2024-05-03\n'
    const ds1 = await upload('file-coherence-ok', okCsv, [{ type: 'dateCoherence' }])
    await waitForFinalize(testUser1, ds1.id)
    const badCsv = 'deb,fin\n2024-05-03,2024-05-01\n'
    const ds2 = await upload('file-coherence-none', badCsv) // no constraint: no check
    await waitForFinalize(testUser1, ds2.id)
  })
})
