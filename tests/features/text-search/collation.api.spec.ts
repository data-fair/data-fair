import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

// Titles chosen so that the two collations disagree on EVERY pair:
//   simple (byte order): 'Zebra' (Z = 0x5a) < 'alpha' (a = 0x61) < 'Elan' with an accent (0xc3…)
//   {locale: 'en'}:      'alpha' < 'Élan' (primary weight e) < 'Zebra'
// so a wrong branch cannot pass by accident.
const BYTE_ORDER = ['col-zebra', 'col-alpha', 'col-elan']
const EN_ORDER = ['col-alpha', 'col-elan', 'col-zebra']

// shared, rare, and in an indexed field, so one q= matches exactly these three
const PROBE = 'collationprobe'

const order = async (params: Record<string, any>) => {
  const { data } = await u1.get('/api/v1/datasets', { params: { select: 'id', sort: 'title', size: 1000, ...params } })
  // keep only our fixtures: the dev database may hold other visible datasets, and filtering a
  // sorted list preserves the relative order of what is left
  return data.results.map((r: any) => r.id).filter((id: string) => id.startsWith('col-'))
}

/**
 * The results query drops the `en` collation as soon as there is a text filter, because the owned
 * `terms` / `owner-terms` indexes are simple-collation and a collated `{_terms: {$in: [...]}}`
 * COLLSCANs the whole collection (findUtils.resultsOptions).
 *
 * That is a performance property, and nothing else in the suite would notice it disappearing — a
 * refactor re-adding `.collation()` "for consistency" would leave every test green and turn every
 * catalog search into a full scan. String sort order is the observable side of the same switch, so
 * these two assertions pin the branch itself: byte order proves no collation was applied, collated
 * order proves it still is where it belongs.
 */
test.describe('collation on the results query', () => {
  test.beforeEach(async () => {
    await clean()
    await u1.post('/api/v1/datasets/col-alpha', { isMetaOnly: true, title: 'alpha', description: PROBE })
    await u1.post('/api/v1/datasets/col-zebra', { isMetaOnly: true, title: 'Zebra', description: PROBE })
    await u1.post('/api/v1/datasets/col-elan', { isMetaOnly: true, title: 'Élan', description: PROBE })
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a q= search runs UNCOLLATED, so the terms index can serve it', async () => {
    assert.deepEqual(await order({ q: PROBE }), BYTE_ORDER)
  })

  test('the browse path keeps the en collation, so sort=title reads naturally', async () => {
    assert.deepEqual(await order({}), EN_ORDER)
  })

  test('applications follow the same rule', async () => {
    // an application id is generated, not chosen, so these assert on the titles themselves
    const titles = ['alpha', 'Zebra', 'Élan']
    for (const title of titles) {
      await u1.post('/api/v1/applications', { title, description: PROBE, url: mockAppUrl('monapp1') })
    }
    const appOrder = async (params: Record<string, any>) => {
      const { data } = await u1.get('/api/v1/applications', { params: { select: 'title', sort: 'title', size: 1000, ...params } })
      return data.results.map((r: any) => r.title).filter((t: string) => titles.includes(t))
    }
    assert.deepEqual(await appOrder({ q: PROBE }), ['Zebra', 'alpha', 'Élan'])
    assert.deepEqual(await appOrder({}), ['alpha', 'Élan', 'Zebra'])
  })
})
