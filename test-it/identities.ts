import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'
import path from 'node:path'
import config from 'config'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const icarlens9 = await getAxiosAuth('icarlens9@independent.co.uk', 'passwd')

describe('identities', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Check secret key', async function () {
    const ax = anonymous
    await assert.rejects(
      ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } }),
      { status: 403 }
    )
  })

  it('Propagate name change to a dataset', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Danna Meadus')
    let res = await ax.post(`/api/v1/identities/user/${dataset.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.owner.name, 'Another Name')
  })

  it('Delete an identity completely', async function () {
    const ax = icarlens9
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Issie Carlens')
    const userDir = path.join(dataDir, 'user', 'icarlens9')
    assert.ok(await filesStorage.pathExists(userDir))
    const res = await ax.delete('/api/v1/identities/user/icarlens9', { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${dataset.id}`),
      { status: 404 }
    )
    assert.ok(!await filesStorage.pathExists(userDir))
  })
})
