// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

const assert = require('assert').strict
const workers = require('../server/workers')

const initMaster = async (ax, schema, bulkSearchs) => {
  await ax.put('/api/v1/datasets/master', {
    isRest: true,
    title: 'master',
    schema,
    masterData: {
      bulkSearchs,
    },
  })
  await workers.hook('finalizer/master')
  const master = (await ax.get('api/v1/datasets/master')).data

  const apiDocUrl = master.href + '/api-docs.json'
  const apiDoc = (await ax.get(apiDocUrl)).data

  const remoteService = (await global.ax.superadmin.get('/api/v1/remote-services/dataset:master', { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

const siretProperty = {
  key: 'siret',
  title: 'Siret',
  type: 'string',
  'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret',
}
const startProperty = {
  key: 'start',
  title: 'Start',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'https://schema.org/startDate',
}
const endProperty = {
  key: 'end',
  title: 'End',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'https://schema.org/endDate',
}
const dateProperty = {
  key: '_date',
  title: 'Date',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'http://schema.org/Date',
}
const latlonProperty = {
  key: 'latlon',
  title: 'lat/long',
  type: 'string',
  'x-refersTo': 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long',
}
const geopointProperty = { ...latlonProperty, key: '_geopoint', title: 'Geopoint' }

describe('Master data management', () => {
  it('should define and use a dataset as master-data remote-service used for extensions', async () => {
    const ax = global.ax.superadmin

    const { remoteService, apiDoc } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }],
      }],
    )
    // the api doc should be extended based on masterData parameters
    const bulkSearchDoc = apiDoc.paths['/master-data/bulk-searchs/siret']
    assert.ok(bulkSearchDoc)
    assert.ok(bulkSearchDoc.post)
    assert.equal(bulkSearchDoc.post.operationId, 'masterData_bulkSearch_siret')
    assert.equal(bulkSearchDoc.post.summary, 'Fetch extra info from siret')
    assert.equal(remoteService.apiDoc.info['x-api-id'], 'localhost-dataset-master')
    assert.equal(remoteService.id, 'dataset:master')
    assert.equal(remoteService.actions.length, 1)
    assert.equal(remoteService.actions[0].id, 'masterData_bulkSearch_siret')

    const items = [{ siret: '82898347800011', extra: 'Extra information' }]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra'],
      }],
    })
    await workers.hook('finalizer/slave')
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    let slave = await workers.hook('finalizer/slave')
    assert.ok(slave.schema.find(p => p.key === '_siret.extra'))
    assert.ok(slave.schema.find(p => p.key === '_siret._error'))
    assert.ok(!slave.schema.find(p => p.key === '_siret.siret'))
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
    assert.ok(!results[0]['_siret.siret'])

    // patching the dataset to remove extension
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [],
    })
    slave = await workers.hook('finalizer/slave')
    console.log(slave)
  })

  it('not return calculated properties', async () => {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }],
      }],
    )

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
      }],
    })
    await workers.hook('finalizer/slave')
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    const slave = await workers.hook('finalizer/slave')
    assert.ok(slave.schema.find(p => p.key === '_siret.extra'))
    assert.ok(slave.schema.find(p => p.key === '_siret._error'))
    assert.ok(slave.schema.find(p => p.key === '_siret.siret'))
    assert.ok(!slave.schema.find(p => p.key === '_siret._rand'))
  })

  it('should handle sorting to chose ambiguous result', async () => {
    const ax = global.ax.superadmin
    await initMaster(
      ax,
      [siretProperty, { key: 'sortKey', type: 'integer' }, { key: 'extra', type: 'string' }],
      [{
        id: 'siret-sort-asc',
        title: 'Fetch extra info from siret while sorting by a key',
        input: [{ type: 'equals', property: siretProperty }],
        sort: 'sortKey',
      }, {
        id: 'siret-sort-desc',
        title: 'Fetch extra info from siret while sorting by a key',
        input: [{ type: 'equals', property: siretProperty }],
        sort: '-sortKey',
      }],
    )

    const items = [
      { siret: '82898347800011', sortKey: 3, extra: 'Extra information 3' },
      { siret: '82898347800011', sortKey: 1, extra: 'Extra information 1' },
      { siret: '82898347800011', sortKey: 2, extra: 'Extra information 2' },
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items)
    await workers.hook('finalizer/master')

    const input = [
      { siret: 'blabla' },
      { siret: '82898347800011' },
    ]
    const resultsAsc = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/siret-sort-asc',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
    ).data.split('\n').filter(line => !!line).map(line => JSON.parse(line))
    assert.equal(resultsAsc[0]._key, 0)
    assert.ok(resultsAsc[0]._error.includes('pas de ligne'))
    assert.equal(resultsAsc[1]._key, 1)
    assert.equal(resultsAsc[1].extra, 'Extra information 1')

    const resultsDesc = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/siret-sort-desc',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' } })
    ).data.split('\n').filter(line => !!line).map(line => JSON.parse(line))
    assert.equal(resultsDesc[0]._key, 0)
    assert.ok(resultsDesc[0]._error.includes('pas de ligne'))
    assert.equal(resultsDesc[1]._key, 1)
    assert.equal(resultsDesc[1].extra, 'Extra information 3')
  })
})

it('should handle date-in-interval search type', async () => {
  const ax = global.ax.superadmin
  await initMaster(
    ax,
    [startProperty, endProperty, { key: 'extra', type: 'string' }],
    [{
      id: 'date-int',
      title: 'Fetch extra info when date is in interval',
      input: [{ type: 'date-in-interval', property: dateProperty }],
    }],
  )

  const items = [
    { start: '2021-05-12T14:23:15.178Z', end: '2021-05-15T14:23:15.178Z', extra: 'Extra information 1' },
    { start: '2021-05-15T14:23:15.178Z', end: '2021-05-18T14:23:15.178Z', extra: 'Extra information 2' },
  ]
  await ax.post('/api/v1/datasets/master/_bulk_lines', items)
  await workers.hook('finalizer/master')

  const input = [
    { _date: '2021-05-14T14:23:15.178Z' },
    { _date: '2021-05-18T14:23:15.178Z' },
    { _date: '2021-05-25T14:23:15.178Z' },
  ]
  const results = (await ax.post(
    '/api/v1/datasets/master/master-data/bulk-searchs/date-int',
    input.map(line => JSON.stringify(line)).join('\n'),
    { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
  ).data.split('\n').filter(line => !!line).map(line => JSON.parse(line))
  assert.equal(results[0].extra, 'Extra information 1')
  assert.equal(results[1].extra, 'Extra information 2')
  assert.ok(results[2]._error.includes('pas de ligne'))
})

it('should handle geo-distance search type', async () => {
  const ax = global.ax.superadmin
  await initMaster(
    ax,
    [latlonProperty, { key: 'extra', type: 'string' }],
    [{
      id: 'geo-dist',
      title: 'Fetch info matching geo shape',
      input: [{ type: 'geo-distance', distance: 0, property: geopointProperty }],
    }],
  )

  const items = [
    { latlon: '-2.7,47.6', extra: 'Extra information 1' },
    { latlon: '-2.8,45.5', extra: 'Extra information 2' },
  ]
  await ax.post('/api/v1/datasets/master/_bulk_lines', items)
  await workers.hook('finalizer/master')

  const input = [
    { _geopoint: '-2.7,47.6' },
    { _geopoint: '-2.8,45.5' },
    { _geopoint: '-2.7,49' },
  ]
  const results = (await ax.post(
    '/api/v1/datasets/master/master-data/bulk-searchs/geo-dist',
    input.map(line => JSON.stringify(line)).join('\n'),
    { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
  ).data.split('\n').filter(line => !!line).map(line => JSON.parse(line))
  assert.equal(results[0].extra, 'Extra information 1')
  assert.equal(results[1].extra, 'Extra information 2')
  assert.ok(results[2]._error.includes('pas de ligne'))
})
