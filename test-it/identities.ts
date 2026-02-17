import { strict as assert } from 'node:assert'
import path from 'node:path'
import config from 'config'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, sendDataset } from './utils/index.ts'

describe('identities', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach(function () { checkPendingTasks(this.name) })

  it('Check secret key', async function () {
    const ax = global.ax.anonymous
    try {
      await ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('Propagate name change to a dataset', async function () {
    const ax = global.ax.dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Danna Meadus')
    let res = await ax.post(`/api/v1/identities/user/${dataset.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.owner.name, 'Another Name')
  })

  it('Delete an identity completely', async function () {
    const ax = global.ax.icarlens9
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Issie Carlens')
    const userDir = path.join(dataDir, 'user', 'icarlens9')
    assert.ok(await filesStorage.pathExists(userDir))
    const res = await ax.delete('/api/v1/identities/user/icarlens9', { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    try {
      await ax.get(`/api/v1/datasets/${dataset.id}`)
    } catch (err) {
      assert.equal(err.status, 404)
    }
    assert.ok(!await filesStorage.pathExists(userDir))
  })
})
