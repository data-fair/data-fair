import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, dmeadusOrg, hlalonde3Org } from './utils/index.ts'

describe('settings API', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should reject wrong account type', async function () {
    try {
      await dmeadus.get('/api/v1/settings/unknown/dmeadus0')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('should reject anonymous request', async function () {
    try {
      await dmeadus.get('/api/v1/settings/user/hlalonde3')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('should read user empty settings', async function () {
    const res = await dmeadus.get('/api/v1/settings/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  it('should reject update with wrong format', async function () {
    try {
      await dmeadus.put('/api/v1/settings/user/dmeadus0', { forbiddenKey: 'not allowed' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('should read settings as organization admin', async function () {
    const res = await dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  it('should write settings as organization admin', async function () {
    await dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [{ id: 'topic1', title: 'Topic 1' }] })
    const res = await dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.topics, [{ id: 'topic1', title: 'Topic 1' }])
  })

  it('should write and read settings as organization department admin', async function () {
    await assert.rejects(hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { topics: [{ id: 'topic1', title: 'Topic 1' }] }), (err) => err.status === 400)
    await dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { apiKeys: [{ title: 'Api key 1', scopes: [] }] })
    const res = await hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:dep1')
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Fivechat - dep1')
    assert.equal(res.data.department, 'dep1')
    assert.deepEqual(res.data.apiKeys[0].title, 'Api key 1')
  })
})
