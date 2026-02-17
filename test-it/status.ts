import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks } from './utils/index.ts'

describe('status', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach(function () { checkPendingTasks(this.name) })

  it('Get status', async function () {
    await assert.rejects(global.ax.anonymous.get('/api/v1/admin/status'), (err) => err.status === 401)
    await assert.rejects(global.ax.superadminPersonal.get('/api/v1/admin/status'), (err) => err.status === 403)
    const res = await global.ax.superadmin.get('/api/v1/admin/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 6)
  })

  it('Ping service', async function () {
    const res = await global.ax.anonymous.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })
})
