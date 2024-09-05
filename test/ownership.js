const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('resource ownership', () => {
  it('Upload new dataset in user zone then change ownership to organization', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
    dataset = (await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(dataset.owner, { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat' })
    assert.deepEqual(dataset.publicationSites, [])
    const newPermissions = (await global.ax.dmeadusOrg.get('/api/v1/datasets/' + dataset.id + '/permissions')).data
    assert.deepEqual(newPermissions[newPermissions.length - 1], { operations: ['readDescription', 'list'] })
  })

  it('Upload new dataset in org zone then change ownership to department', async () => {
    const ax = global.ax.dmeadusOrg
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
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
