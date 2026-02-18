import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'

const anonymous = getAxios()
const superadmin = await getAxiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const superadminPersonal = await getAxiosAuth('superadmin@test.com', 'superpasswd')
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('status', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get status', async function () {
    await assert.rejects(anonymous.get('/api/v1/admin/status'), (err: any) => err.status === 401)
    await assert.rejects(superadminPersonal.get('/api/v1/admin/status'), (err: any) => err.status === 403)
    const res = await superadmin.get('/api/v1/admin/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 6)
  })

  it('Ping service', async function () {
    const res = await anonymous.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })
})
