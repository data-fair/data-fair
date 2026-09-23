import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const conceptSchema = [
  { key: 'deb', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/startDate', title: 'Début' },
  { key: 'fin', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/endDate', title: 'Fin' }
]

const makeRest = async (id: string, body: any = {}) => {
  const res = await testUser1.post(`/api/v1/datasets/${id}`, {
    isRest: true, title: id, schema: conceptSchema, constraints: [{ type: 'dateCoherence' }], ...body
  })
  assert.equal(res.data.status, 'finalized')
}

test.describe('REST dataset dateCoherence constraint', () => {
  test.beforeEach(async () => { await clean() })

  test('rejects an incoherent line with 400 and a message naming both columns', async () => {
    await makeRest('rest-coherence')
    const bad = await testUser1.post('/api/v1/datasets/rest-coherence/lines',
      { deb: '2024-05-03', fin: '2024-05-01' }, { validateStatus: () => true })
    assert.equal(bad.status, 400)
    assert.match(JSON.stringify(bad.data), /Incohérence de dates/)
    assert.match(JSON.stringify(bad.data), /Début/)
    assert.match(JSON.stringify(bad.data), /Fin/)
  })

  test('accepts coherent, equal and open-ended lines', async () => {
    await makeRest('rest-coherence-ok')
    for (const line of [
      { deb: '2024-05-01', fin: '2024-05-02' },
      { deb: '2024-05-01', fin: '2024-05-01' },
      { deb: '2024-05-01' }
    ]) {
      const res = await testUser1.post('/api/v1/datasets/rest-coherence-ok/lines', line, { validateStatus: () => true })
      assert.ok(res.status < 300, `status ${res.status} for ${JSON.stringify(line)}`)
    }
  })

  test('a patch action is checked against the merged row', async () => {
    await makeRest('rest-coherence-patch')
    const created = await testUser1.post('/api/v1/datasets/rest-coherence-patch/lines', { deb: '2024-05-03', fin: '2024-05-04' })
    const lineId = created.data._id
    // patching only fin below the stored deb must be rejected
    const bad = await testUser1.patch(`/api/v1/datasets/rest-coherence-patch/lines/${lineId}`,
      { fin: '2024-05-01' }, { validateStatus: () => true })
    assert.equal(bad.status, 400)
    // patching it to a valid value passes
    const ok = await testUser1.patch(`/api/v1/datasets/rest-coherence-patch/lines/${lineId}`,
      { fin: '2024-05-10' }, { validateStatus: () => true })
    assert.ok(ok.status < 300, `status ${ok.status}`)
  })

  test('nonBlockingValidation accepts the line with a warning', async () => {
    await makeRest('rest-coherence-nb', { nonBlockingValidation: true })
    const res = await testUser1.post('/api/v1/datasets/rest-coherence-nb/lines',
      { deb: '2024-05-03', fin: '2024-05-01' }, { validateStatus: () => true })
    assert.ok(res.status < 300, `status ${res.status}`)
    await waitForFinalize(testUser1, 'rest-coherence-nb')
    const lines = (await testUser1.get('/api/v1/datasets/rest-coherence-nb/lines')).data
    assert.equal(lines.total, 1) // the line was persisted despite the violation
  })

  test('adding the constraint over violating existing data rejects the PATCH', async () => {
    // created WITHOUT the constraint
    const res = await testUser1.post('/api/v1/datasets/rest-coherence-scan', {
      isRest: true, title: 'rest-coherence-scan', schema: conceptSchema
    })
    assert.equal(res.data.status, 'finalized')
    await testUser1.post('/api/v1/datasets/rest-coherence-scan/lines', { deb: '2024-05-01', fin: '2024-05-02' })
    await testUser1.post('/api/v1/datasets/rest-coherence-scan/lines', { deb: '2024-05-03', fin: '2024-05-01' })
    await waitForFinalize(testUser1, 'rest-coherence-scan')

    const patchRes = await testUser1.patch('/api/v1/datasets/rest-coherence-scan',
      { constraints: [{ type: 'dateCoherence' }] }, { validateStatus: () => true })
    assert.equal(patchRes.status, 400)
    assert.match(JSON.stringify(patchRes.data), /Incohérence de dates/)

    // fix the offending line, then the PATCH passes
    const lines = (await testUser1.get('/api/v1/datasets/rest-coherence-scan/lines')).data.results
    const bad = lines.find((l: any) => l.deb === '2024-05-03')
    await testUser1.patch(`/api/v1/datasets/rest-coherence-scan/lines/${bad._id}`, { fin: '2024-05-10' })
    await waitForFinalize(testUser1, 'rest-coherence-scan')
    const ok = await testUser1.patch('/api/v1/datasets/rest-coherence-scan',
      { constraints: [{ type: 'dateCoherence' }] }, { validateStatus: () => true })
    assert.ok(ok.status < 300, `status ${ok.status}`)
  })
})
