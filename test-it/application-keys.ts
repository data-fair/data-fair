import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, bhazeldean7Org } from './utils/index.ts'

describe('Applications keys for unauthenticated readOnly access', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Empty array by default', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/api/v1/applications/${appId}/keys`)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 0)
  })

  it('Restricted to admins', async function () {
    const res = await dmeadus.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    try {
      await bhazeldean7Org.get(`/api/v1/applications/${appId}/keys`)
      assert.fail()
    } catch (err: any) {
      assert.equal(err.status, 403)
    }
  })

  it('Automatically filled ids', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 1)
    assert.ok(!!res.data[0].id)
  })
})
