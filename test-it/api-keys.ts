import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus } from './utils/index.ts'
import dayjs from 'dayjs'

describe('API keys', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Manage some invald input', async function () {
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], expireAt: dayjs().add(4, 'year').format('YYYY-MM-DD') }
      ]
    }), { status: 400 })

    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], id: 'test' }
      ]
    }), { status: 400 })

    const res = await dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'] }
      ]
    })
    assert.equal(res.data.apiKeys.length, 1)
    assert.ok(res.data.apiKeys[0].clearKey)
    assert.ok(res.data.apiKeys[0].id)
    assert.ok(!res.data.apiKeys[0].key)
    await dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: res.data.apiKeys
    })
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { ...res.data.apiKeys[0], title: 'renamed api key' }
      ]
    }), { status: 400 })
  })
})
