import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadusOrg } from './utils/index.ts'

describe('REST datasets with owner specific lines', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Create empty REST dataset with activated line ownership', async function () {
    const ax = dmeadusOrg
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'a rest dataset',
      rest: { lineOwnership: true, history: true },
      schema: [{ key: 'col1', type: 'string' }]
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'a-rest-dataset')
    const dataset = res.data
    assert.ok(dataset.schema.find((p: any) => p.key === '_owner'))
    assert.ok(dataset.schema.find((p: any) => p.key === '_ownerName'))
    assert.equal(dataset.schema.length, 7)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 0)
  })
})
