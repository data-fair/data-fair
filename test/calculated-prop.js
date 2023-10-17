const assert = require('assert').strict
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('Calculated properties', () => {
  it('should use expression to calculate a readOnly property', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    // console.log('dataset', dataset)
    const schema = [...dataset.schema]
    schema.push({
      key: 'myprop',
      title: 'My property',
      type: 'string',
      'x-constExpr': 'concatString(data.id, " - ", data.adr)'
    })
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })
    await workers.hook('finalizer/' + dataset.id)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].myprop, 'koumoul - 19 rue de la voie lactée saint avé')
  })

  it('should use expression to calculate a readOnly property of a rest dataset', async () => {
    const ax = global.ax.dmeadus
    let schema = [{ key: 'attr1', type: 'string', readOnly: true }, { key: 'attr2', type: 'string' }]
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest1',
      schema
    })).data
    await workers.hook(`finalizer/${dataset.id}`)
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { attr1: 'test1', attr2: 'test1' })
    await workers.hook(`finalizer/${dataset.id}`)

    const exprProp = {
      key: 'calcattr',
      title: 'My property',
      type: 'string',
      'x-constExpr': 'concatString(data.attr1, " - ", data.attr2)'
    }
    schema = schema.concat([exprProp])
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })
    await workers.hook(`finalizer/${dataset.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].calcattr, 'test1 - test1')

    exprProp['x-constExpr'] = 'concatString(data.attr1, " tada ", data.attr2)'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema })
    await workers.hook(`finalizer/${dataset.id}`)
    lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].calcattr, 'test1 tada test1')
  })
})
