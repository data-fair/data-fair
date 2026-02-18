import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('resource ownership', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Upload new dataset in user zone then change ownership to organization', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be lost
    await ax.post('/api/v1/settings/user/dmeadus0/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await assert.rejects(
      ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'organization',
        id: 'anotherorg',
        name: 'Test'
      }),
      err => err.status === 403
    )
    await assert.rejects(
      ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'user',
        id: 'anotheruser',
        name: 'Test'
      }),
      err => err.status === 403
    )
    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat'
    })
    dataset = (await dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat' })
    assert.deepEqual(dataset.publicationSites, [])
    const newPermissions = (await dmeadusOrg.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

  it('Upload new dataset in org zone then change ownership to department', async function () {
    const ax = dmeadusOrg
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    // a public permission, this should be preserved
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [{ operations: ['readDescription', 'list'] }])
    // a publication on a portal, that will be preserved too
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://portal.com' })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      department: 'dep1',
      name: 'Fivechat'
    })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat', department: 'dep1' })
    assert.deepEqual(dataset.publicationSites, ['data-fair-portals:portal1'])
    const newPermissions = (await ax.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })
})
