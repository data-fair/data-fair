import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import * as whereParser from '../api/src/catalogs/plugins/ods/where.peg.js'

describe('compatibility layer for ods api', function () {
  it('contains a parser for the where syntax', function () {
    assert.deepEqual(
      whereParser.parse('"koumoul"', { searchFields: ['id'] }),
      [{
        multi_match: {
          query: 'koumoul',
          fields: ['id'],
          operator: 'and',
          type: 'cross_fields'
        }
      }]
    )

    assert.deepEqual(
      whereParser.parse('id:"koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      [{ term: { id: 'koumoul' } }]
    )
    assert.deepEqual(
      whereParser.parse('id: "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      [{ term: { id: 'koumoul' } }]
    )
    assert.deepEqual(
      whereParser.parse('id : "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      [{ term: { id: 'koumoul' } }]
    )
    assert.deepEqual(
      whereParser.parse('id = "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      [{ term: { id: 'koumoul' } }]
    )
    assert.deepEqual(
      whereParser.parse('nb > 12', { dataset: { schema: [{ key: 'nb' }] } }),
      [{ range: { nb: { gt: 12 } } }]
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 AND nb < 30', { dataset: { schema: [{ key: 'nb' }] } }),
      [{ bool: { filter: [{ range: { nb: { gt: 12 } } }, { range: { nb: { lt: 30 } } }] } }]
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      [{ bool: { should: [{ range: { nb: { gt: 12 } } }, { term: { id: 'koumoul' } }] } }]
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul" AND nb <= 12', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      [{ bool: { should: [{ range: { nb: { gt: 12 } } }, { bool: { filter: [{ term: { id: 'koumoul' } }, { range: { nb: { lte: 12 } } }] } }] } }]
    )
    assert.deepEqual(
      whereParser.parse('(nb > 12 OR nb < 10) AND id = "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      [{
        bool: {
          filter: [
            { bool: { should: [{ range: { nb: { gt: 12 } } }, { range: { nb: { lt: 10 } } }] } },
            { term: { id: 'koumoul' } }
          ]
        }
      }]
    )
    assert.deepEqual(
      whereParser.parse('NOT id = "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      [{ bool: { must_not: [{ term: { id: 'koumoul' } }] } }]
    )
  })

  it('exposes records api on 2 urls', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    let res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

    // simple filters
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { query: { where: 'id: "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { query: { where: 'id = "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { query: { where: 'id: koumoul' } }), { status: 400 })
  })
})
