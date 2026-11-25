/**
 * The dev-only line edition arm (api/contract/x-agent-line-edition.ts) is one value for the whole platform
 * document, held by the owners of the runs that set it: another owner cannot switch it under them (409), the
 * holders release it with null, and the clean of a holder's sub-space releases it too.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { anonymousAx, apiUrl, clean } from '../../support/axios.ts'

const armUrl = `${apiUrl}/api/v1/test-env/line-edition-arm`
const own = { type: 'organization', id: 'test_datafair_org1' }
const otherPrefix = 'test_datafairother_'
const other = { type: 'organization', id: `${otherPrefix}org` }

const setArm = (owner: unknown, arm: string | null) => anonymousAx.post(armUrl, { owner, arm })

/** the arm the platform document serves: write_line is json's, the create_line form editor's */
const servedArm = async () => {
  const doc = (await anonymousAx.get('/api/v1/platform/api-docs.json')).data
  const names = Object.values(doc.paths).flatMap((item: any) => Object.values(item))
    .flatMap((op: any) => [op?.['x-agent'] ?? []].flat()).map((entry: any) => entry.name)
  if (names.includes('datafair_write_line')) return 'json'
  if (names.includes('datafair_create_line')) return 'editor'
  return null
}

test.describe('line edition arm holders', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async () => {
    await setArm(own, null)
    await setArm(other, null)
    await clean()
  })

  test('the owner is required', async () => {
    await assert.rejects(anonymousAx.post(armUrl, { arm: 'json' }), { status: 400 })
  })

  test('an owner holds the arm, another owner cannot switch it', async () => {
    assert.equal((await setArm(own, 'json')).status, 204)
    assert.equal(await servedArm(), 'json')
    await assert.rejects(setArm(other, 'editor'), (err: any) => {
      assert.equal(err.status, 409)
      assert.match(String(err.data), /organization:test_datafair_org1/)
      return true
    })
    // a release by an owner that holds nothing changes nothing (a run that failed before holding it releases too)
    assert.equal((await setArm(other, null)).status, 204)
    assert.equal(await servedArm(), 'json')
    // the holder itself switches it
    assert.equal((await setArm(own, 'editor')).status, 204)
    assert.equal(await servedArm(), 'editor')
  })

  test('the same arm is shared, and kept until its last holder releases it', async () => {
    await setArm(own, 'json')
    assert.equal((await setArm(other, 'json')).status, 204)
    await assert.rejects(setArm(other, 'editor'), { status: 409 }, 'a co-holder cannot switch it either')
    await setArm(own, null)
    assert.equal(await servedArm(), 'json')
    await setArm(other, null)
    assert.equal(await servedArm(), null)
  })

  test('the holder releases it with null', async () => {
    await setArm(own, 'editor')
    assert.equal((await setArm(own, null)).status, 204)
    assert.equal(await servedArm(), null)
    assert.equal((await setArm(other, 'json')).status, 204)
  })

  test('the clean of the holder\'s sub-space releases it, another clean does not', async () => {
    await setArm(other, 'json')
    await clean()
    assert.equal(await servedArm(), 'json')
    assert.equal((await anonymousAx.delete(`${apiUrl}/api/v1/test-env`, { params: { prefix: otherPrefix } })).status, 204)
    assert.equal(await servedArm(), null)
    assert.equal((await setArm(own, 'editor')).status, 204)
  })
})
