const assert = require('assert').strict
const workers = require('../server/workers')

describe('REST datasets with owner specific lines', () => {
  it('Create empty REST dataset with activated line ownership', async () => {
    // the dataset is created in an organization
    let res = await global.ax.dmeadusOrg.post('/api/v1/datasets', {
      isRest: true,
      title: 'a rest dataset',
      rest: { lineOwnership: true, history: true },
      schema: [{ key: 'col1', type: 'string' }]
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'a-rest-dataset')
    const dataset = await workers.hook('finalizer/' + res.data.id)
    assert.ok(dataset.schema.find(p => p.key === '_owner'))
    assert.ok(dataset.schema.find(p => p.key === '_ownerName'))

    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 0)

    // owner's admin can use routes to manage his own lines
    await global.ax.dmeadusOrg.post(`/api/v1/datasets/${dataset.id}/own/user:dmeadus0/lines`, { _id: 'dmeadusline', col1: 'value 1' })
    await workers.hook('finalizer/' + dataset.id)
    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/own/user:dmeadus0/lines`)
    assert.equal(res.data.total, 1)
    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'dmeadusline')

    // even owner's admin cannot use routes dedicated for other uses
    await assert.rejects(global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`), (err) => err.status === 403)

    // external user cannot do anything yet
    await assert.rejects(global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/lines`), (err) => err.status === 403)
    await assert.rejects(global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`), (err) => err.status === 403)

    // give permission to external users to manage his own lines in the dataset
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { type: 'user', id: 'cdurning2', classes: ['manageOwnLines'], operations: ['readSafeSchema'] },
      { type: 'user', id: 'alone', classes: ['manageOwnLines'], operations: ['readSafeSchema'] }
    ])

    // external user cannot read all lines, but he can read his own lines
    await assert.rejects(global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/lines`), (err) => err.status === 403)
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`)
    assert.equal(res.data.total, 0)
    await global.ax.cdurning2.post(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`, { _id: 'cdurningline', col1: 'value 1' })
    await workers.hook('finalizer/' + dataset.id)
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'cdurningline')

    // other external user can also manage his lines
    await global.ax.alone.post(`/api/v1/datasets/${dataset.id}/own/user:alone/lines`, { _id: 'aloneline', col1: 'value 1' })
    await workers.hook('finalizer/' + dataset.id)
    res = await global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'aloneline')
    res = await global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`)
    assert.equal(res.data._id, 'aloneline')
    // he cannot see line of another user
    assert.rejects(global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`), (err) => err.status === 403)
    assert.rejects(global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/cdurningline`), (err) => err.status === 404)
    // he can patch his lines but cannot change ownership
    await global.ax.alone.patch(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`, { col1: 'value 2' })
    await workers.hook('finalizer/' + dataset.id)
    res = await global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`)
    assert.equal(res.data.col1, 'value 2')
    await global.ax.alone.patch(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`, { _owner: 'user:cdurning2', col1: 'value 3' })
    await workers.hook('finalizer/' + dataset.id)
    res = await global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`)
    assert.equal(res.data.col1, 'value 3')
    assert.equal(res.data._owner, 'user:alone')

    // owner's admin can see all lines
    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)

    // owner's admin can change line ownership
    await global.ax.dmeadusOrg.patch(`/api/v1/datasets/${dataset.id}/lines/aloneline`, { _owner: 'user:cdurning2', col1: 'value 4' })
    await workers.hook('finalizer/' + dataset.id)
    assert.rejects(global.ax.alone.get(`/api/v1/datasets/${dataset.id}/own/user:alone/lines/aloneline`), (err) => err.status === 404)
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines/aloneline`)
    assert.equal(res.data.col1, 'value 4')
    assert.equal(res.data._owner, 'user:cdurning2')

    // the revisions are also filtered on owner
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines/aloneline/revisions`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._owner, 'user:cdurning2')
    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/lines/aloneline/revisions`)
    assert.equal(res.data.total, 4)
    assert.equal(res.data.results[0]._owner, 'user:cdurning2')
    assert.equal(res.data.results[1]._owner, 'user:alone')

    // give permission to ALL external users to manage their own lines in the dataset
    await global.ax.dmeadusOrg.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { type: 'user', id: '*', classes: ['manageOwnLines'], operations: ['readSafeSchema'] }
    ])
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/own/user:cdurning2/lines`)

    // safe schema for external users is purged of indices about the data
    res = await global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/safe-schema`)
    assert.equal(res.data.find(p => p.key === 'col1')['x-cardinality'], undefined)
    res = await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}/schema`)
    assert.equal(res.data.find(p => p.key === 'col1')['x-cardinality'], 2)
    await assert.rejects(global.ax.cdurning2.get(`/api/v1/datasets/${dataset.id}/schema`), (err) => err.status === 403)
  })
})
