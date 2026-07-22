// tests/features/integrity/attribution.api.spec.ts
// T2: the `.who` attribution sibling — store.writeWho/getWho, locked with its OWN retention
// (config integrity.attribution.retentionDays), shorter than the revision's own retention
// (config integrity.retention.days) and never extended. This is the MinIO proof that a
// per-object retain-until shorter than the sibling revision's is honored (design doc §6.1/§6.3).
import { test, expect } from '@playwright/test'
import { clean } from '../../support/axios.ts'
import { ensureIntegrityBucket, integrityTestStore } from '../../support/integrity.ts'
import * as ops from '../../../api/src/integrity/operations.ts'

test.beforeAll(async () => { await ensureIntegrityBucket() })
test.beforeEach(async () => { await clean() })

test('writeWho stores a compliance-locked .who sibling with its own (shorter) retention than the revision', async () => {
  const store = integrityTestStore
  const owner = { type: 'user', id: `test-attribution-${Date.now()}` }
  const datasetId = 'ds-attribution'
  const key = ops.revisionKey(owner, datasetId, 0)
  const whoKey = ops.whoKey(owner, datasetId, 0)
  expect(whoKey).toBe(`${key}.who`)

  const revisionRetainUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  const whoRetainUntil = new Date(Date.now() + 180 * 24 * 3600 * 1000)

  await store.writeRevision(key, {
    hash: { file: 'attr123' },
    context: { operation: 'create', origin: 'worker', date: new Date().toISOString() },
    dataset: { id: datasetId }
  }, revisionRetainUntil)

  const whoBody = { date: new Date().toISOString(), user: { id: 'alice' }, ip: '1.2.3.4' }
  await store.writeWho(whoKey, whoBody, whoRetainUntil)

  // both siblings read back independently
  const backRevision = await store.getRevision(key)
  expect(backRevision.hash.file).toBe('attr123')
  const backWho = await store.getWho(whoKey)
  expect(backWho).toEqual(whoBody)

  // and their retain-until dates genuinely differ: the .who sibling is shorter than its revision,
  // proving MinIO honors a per-object COMPLIANCE date distinct from (and shorter than) a sibling's
  const revisionRetention = await store.getRetention(key)
  const whoRetention = await store.getRetention(whoKey)
  expect(revisionRetention).toBeTruthy()
  expect(whoRetention).toBeTruthy()
  expect(whoRetention!.getTime()).toBeLessThan(revisionRetention!.getTime())
  expect(Math.abs(whoRetention!.getTime() - whoRetainUntil.getTime())).toBeLessThan(5000)
  expect(Math.abs(revisionRetention!.getTime() - revisionRetainUntil.getTime())).toBeLessThan(5000)
})

test('getWho normalizes a missing key the same way getRevision does', async () => {
  const store = integrityTestStore
  const missingKey = `data-fair/test-attribution-missing/${Date.now()}/000000000.who`
  await expect(store.getRevision(missingKey)).rejects.toMatchObject({ name: 'NoSuchKey' })
  await expect(store.getWho(missingKey)).rejects.toMatchObject({ name: 'NoSuchKey' })
})
