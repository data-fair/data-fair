// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import FormData from 'form-data'
import * as restDatasetsUtils from '../api/src/datasets/utils/rest.js'

import * as workers from '../api/src/workers/index.js'

const initMaster = async (ax, info, masterData, id = 'master') => {
  if (Array.isArray(masterData)) {
    masterData = { bulkSearchs: masterData }
  }
  if (Array.isArray(info)) {
    info = { schema: info }
  }
  await ax.put('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    masterData,
    ...info
  })
  const master = (await ax.get('/api/v1/datasets/' + id)).data

  const apiDocUrl = master.href + '/api-docs.json'
  const apiDoc = (await ax.get(apiDocUrl)).data

  await ax.post('/api/v1/_check-api', apiDoc)

  const remoteService = (await global.ax.superadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

const siretProperty = {
  key: 'siret',
  title: 'Siret',
  type: 'string',
  'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
}
const countryProperty = {
  key: 'country',
  title: 'Country',
  type: 'string',
  'x-refersTo': 'https://www.omg.org/spec/LCC/Countries/CountryRepresentation/Alpha3Code'
}

const startProperty = {
  key: 'start',
  title: 'Start',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'https://schema.org/startDate'
}
const endProperty = {
  key: 'end',
  title: 'End',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'https://schema.org/endDate'
}
const dateProperty = {
  key: '_date',
  title: 'Date',
  type: 'string',
  format: 'date-time',
  'x-refersTo': 'http://schema.org/Date'
}
const latlonProperty = {
  key: 'latlon',
  title: 'lat/long',
  type: 'string',
  'x-refersTo': 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
}
const geopointProperty = { ...latlonProperty, key: '_geopoint', title: 'Geopoint' }
const latProperty = {
  key: 'lat',
  title: 'lat',
  type: 'string',
  'x-refersTo': 'http://schema.org/latitude'
}
const lonProperty = {
  key: 'lon',
  title: 'long',
  type: 'string',
  'x-refersTo': 'http://schema.org/longitude'
}

describe('Master data management', function () {
  it('should define and use a dataset as master-data remote-service used for extensions', async function () {
    const ax = global.ax.superadmin

    const { remoteService, apiDoc } = await initMaster(
      ax,
      [
        siretProperty,
        { key: 'extra', type: 'string', 'x-labels': { value1: 'label1' }, 'x-capabilities': { text: false } },
        { key: 'extraFilter', type: 'string' },
        { key: 'extraMulti', type: 'string', separator: ', ' }
      ]
      ,
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        filters: [{ property: { key: 'extraFilter' }, values: ['filterOk'] }],
        input: [{ type: 'equals', property: siretProperty }]
      }]
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

    // feed some data to the master
    const items = [
      { siret: '82898347800011', extra: 'Extra information', extraFilter: 'filterOk', extraMulti: 'multi1,multi2' },
      { siret: '82898347800012', extra: 'Extra information', extraFilter: 'filterKo' }
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // use the bulk-searchs endpoint with various mime-types, errors, etc.
    let res = await ax.post('/api/v1/datasets/master/master-data/bulk-searchs/siret', [
      { siret: '82898347800011' },
      { siret: '82898347800012' }
    ])
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0].siret, '82898347800011')
    assert.equal(res.data[0].extra, 'Extra information')
    assert.equal(res.data[0].extraMulti, 'multi1, multi2')
    assert.ok(res.data[1]._error)
    res = await ax.post('/api/v1/datasets/master/master-data/bulk-searchs/siret', [{ siret: '82898347800011' }, { siret: 'unknown' }])
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0].siret, '82898347800011')
    assert.equal(res.data[0].extra, 'Extra information')
    assert.ok(res.data[1]._error)
    res = await ax.post('/api/v1/datasets/master/master-data/bulk-searchs/siret', [{ siret: 'unknown' }, { siret: '82898347800011' }])
    assert.equal(res.data.length, 2)
    assert.ok(res.data[0]._error)
    assert.equal(res.data[1].siret, '82898347800011')
    assert.equal(res.data[1].extra, 'Extra information')
    res = await ax.post('/api/v1/datasets/master/master-data/bulk-searchs/siret', 'siret\n82898347800011', { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data, `siret,extra,extraFilter,extraMulti,_key,_error
82898347800011,Extra information,filterOk,"multi1, multi2",0,
`)
    res = await ax.post('/api/v1/datasets/master/master-data/bulk-searchs/siret', 'siret\nunknown\n82898347800011', { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data, `siret,extra,extraFilter,extraMulti,_key,_error
,,,,0,La donnée de référence ne contient pas de ligne correspondante.
82898347800011,Extra information,filterOk,"multi1, multi2",1,
`)

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty]
    })
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }, { siret: '82898347800011' }])
    await workers.hook('finalizer/slave')

    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'extraMulti']
      }]
    })
    await workers.hook('extender/slave')
    let slave = await workers.hook('finalizer/slave')

    let extraProp = slave.schema.find(p => p.key === '_siret.extra')
    assert.ok(extraProp)
    assert.ok(extraProp['x-labels'])
    assert.equal(extraProp['x-labels'].value1, 'label1')
    assert.ok(extraProp['x-capabilities'])
    assert.equal(extraProp['x-capabilities'].text, false)
    const extraMultiProp = slave.schema.find(p => p.key === '_siret.extraMulti')
    assert.ok(extraMultiProp)
    assert.equal(extraMultiProp.separator, ', ')
    assert.deepEqual(extraMultiProp.enum, ['multi1', 'multi2'])
    assert.ok(slave.schema.find(p => p.key === '_siret._error'))
    assert.ok(!slave.schema.find(p => p.key === '_siret.siret'))
    let results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
    assert.equal(results[0]['_siret.extraMulti'], 'multi1, multi2')
    assert.equal(results[1]['_siret.extra'], 'Extra information')
    assert.ok(!results[0]['_siret.siret'])

    // activate auto update
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{
        active: true,
        autoUpdate: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'extraMulti']
      }]
    })
    const items2 = [{ siret: '82898347800011', extra: 'Extra information 2', extraFilter: 'filterOk' }]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items2.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')
    slave = (await ax.get('/api/v1/datasets/slave')).data
    assert.ok(slave.extensions[0].nextUpdate)
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{ ...slave.extensions[0], nextUpdate: new Date().toISOString() }]
    })
    await workers.hook('finalizer/slave')
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information 2')

    // overwrite some attributes of the extended property
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra'],
        overwrite: {
          extra: {
            'x-originalName': 'siretExtra',
            title: 'Extra extended'
          }
        },
      }]
    })
    await workers.hook('extender/slave')
    slave = await workers.hook('finalizer/slave')
    assert.equal(slave.schema.find(p => p.key === '_siret.extra'), undefined)
    extraProp = slave.schema.find(p => p.key === 'siretextra')
    assert.ok(extraProp)
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['siretextra'], 'Extra information 2')
    assert.equal(results[1]['siretextra'], 'Extra information 2')
    assert.ok(!results[0]['_siret.extra'])

    // overwrite some attributes of the extended property one more time
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra'],
        overwrite: {
          extra: {
            'x-originalName': 'siretExtExtra',
            title: 'Extra extended'
          }
        },
      }]
    })
    await workers.hook('extender/slave')
    slave = await workers.hook('finalizer/slave')
    assert.equal(slave.schema.find(p => p.key === '_siret.extra'), undefined)
    assert.equal(slave.schema.find(p => p.key === 'siretextra'), undefined)
    extraProp = slave.schema.find(p => p.key === 'siretextextra')
    assert.ok(extraProp)
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['siretextextra'], 'Extra information 2')
    assert.equal(results[1]['siretextextra'], 'Extra information 2')
    assert.ok(!results[0]['_siret.extra'])
    assert.ok(!results[0]['siretextra'])

    // patching title has no effect
    await ax.patch('/api/v1/datasets/slave', { title: 'Slave 2' })
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['siretextextra'], 'Extra information 2')

    // forcing a reindex has no effect
    await global.ax.superadmin.post('/api/v1/datasets/slave/_reindex')
    slave = await workers.hook('finalizer/slave')
    assert.equal(slave.schema.find(p => p.key === '_siret.extra'), undefined)
    assert.equal(slave.schema.find(p => p.key === 'siretextra'), undefined)
    extraProp = slave.schema.find(p => p.key === 'siretextextra')

    // patching the dataset to remove extension
    await ax.patch('/api/v1/datasets/slave', {
      extensions: []
    })
    await workers.hook('finalizer/slave')
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.ok(!results[0]['_siret.extra'])
    assert.ok(!results[0]['siretextextra'])
    assert.ok(!results[0]['siretextra'])
    const docs = await restDatasetsUtils.collection(global.db, slave).find({}).toArray()
    assert.ok(!docs[0]['_siret'])
    assert.ok(!docs[0]['siretextextra'])
    assert.ok(!docs[0]['siretextra'])
  })

  it('accept an input with elasticsearch special chars', async function () {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    const items = [{ siret: 'TEST"SIRET*', extra: 'Extra information' }]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra']
      }]
    })
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: 'TEST"SIRET*' }].map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
  })

  it('manage query syntax errors', async function () {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    const items = [{ siret: 'TEST"SIRET*', extra: 'Extra information' }]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra']
      }]
    })
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: 'test " failure' }].map(item => ({ _id: item.siret, ...item })))
    await assert.rejects(workers.hook('finalizer/slave'), (err) => {
      assert.ok(err.message.includes('Impossible d\'effectuer cette recherche'), `message was ${err.message}`)
      return true
    })
    const journal = (await ax.get('/api/v1/datasets/slave/journal')).data
    assert.ok(journal[0].data.includes('Impossible d\'effectuer cette recherche'))
  })

  it('should extend a geojson file from a master-data dataset', async function () {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }, { key: 'denomination', 'x-originalName': 'Dénomination', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )
    const items = [{ siret: '82898347800011', extra: 'Extra information', denomination: 'Dénomination string' }]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // create a slave from a geojson file
    let geojsonSlave = await testUtils.sendDataset('datasets/dataset-siret-extensions.geojson', ax)
    geojsonSlave.schema.find(field => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    let res = await ax.patch(`/api/v1/datasets/${geojsonSlave.id}`, {
      schema: geojsonSlave.schema,
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'denomination']
      }]
    })
    assert.equal(res.status, 200)
    geojsonSlave = await workers.hook(`finalizer/${geojsonSlave.id}`)
    res = await ax.get(`/api/v1/datasets/${geojsonSlave.id}/full`)
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 1)
    assert.equal(res.data.features[0].properties.Siret, '82898347800011')
    assert.equal(res.data.features[0].properties.Label, 'koumoul')
    assert.equal(res.data.features[0].properties._siret.extra, 'Extra information')
    assert.equal(res.data.features[0].properties._siret.denomination, 'Dénomination string')
    let results = (await ax.get(`/api/v1/datasets/${geojsonSlave.id}/lines`)).data.results
    assert.equal(results[0].siret, '82898347800011')
    assert.equal(results[0].label, 'koumoul')
    assert.equal(results[0]['_siret.extra'], 'Extra information')
    assert.equal(results[0]['_siret.denomination'], 'Dénomination string')

    // patch the extension to overwrite keys
    await ax.patch(`/api/v1/datasets/${geojsonSlave.id}`, {
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'denomination'],
        overwrite: {
          extra: {
            'x-originalName': 'siretExtra'
          },
          denomination: {
            'x-originalName': 'siretDenomination'
          }
        }
      }]
    })
    geojsonSlave = await workers.hook(`finalizer/${geojsonSlave.id}`)
    res = await ax.get(`/api/v1/datasets/${geojsonSlave.id}/full`)
    assert.equal(res.data.features.length, 1)
    assert.equal(res.data.features[0].properties.siretExtra, 'Extra information')
    assert.equal(res.data.features[0].properties.siretDenomination, 'Dénomination string')
    results = (await ax.get(`/api/v1/datasets/${geojsonSlave.id}/lines`)).data.results
    assert.equal(results[0].siret, '82898347800011')
    assert.equal(results[0].label, 'koumoul')
    assert.equal(results[0].siretextra, 'Extra information')
    assert.equal(results[0].siretdenomination, 'Dénomination string')
  })

  it('not return calculated properties', async function () {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret'
      }]
    })
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    const slave = await workers.hook('finalizer/slave')
    assert.ok(slave.schema.find(p => p.key === '_siret.extra'))
    assert.ok(slave.schema.find(p => p.key === '_siret._error'))
    assert.ok(slave.schema.find(p => p.key === '_siret.siret'))
    assert.ok(!slave.schema.find(p => p.key === '_siret._rand'))
  })

  it('return multiple levels of extended properties', async function () {
    const ax = global.ax.superadmin

    const { remoteService } = await initMaster(
      ax,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }],
      'master1'
    )

    const { remoteService: remoteService2 } = await initMaster(
      ax,
      {
        schema: [siretProperty, { key: 'extra2', type: 'string' }],
        extensions: [{
          active: true,
          type: 'remoteService',
          remoteService: remoteService.id,
          action: 'masterData_bulkSearch_siret'
        }]
      },
      [{
        id: 'siret2',
        title: 'Fetch extra info 2 from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }],
      'master2'
    )

    // create slave dataset
    const slave = (await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService2.id,
        action: 'masterData_bulkSearch_siret2'
      }]
    })).data

    // slave schema contains props from both levels of extensions
    assert.ok(slave.schema.find(p => p.key === '_siret2.extra2'))
    assert.ok(slave.schema.find(p => p.key === '_siret2.siret'))
    assert.ok(slave.schema.find(p => p.key === '_siret2._error'))
    assert.ok(slave.schema.find(p => p.key === '_siret2._siret.extra'))
    assert.ok(slave.schema.find(p => p.key === '_siret2._siret.siret'))
    assert.ok(!slave.schema.find(p => p.key === '_siret2._siret._error'))

    // feed some data to the masters
    const items = [{ siret: '82898347800011', extra: 'Extra information' }]
    await ax.post('/api/v1/datasets/master1/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master1')
    const items2 = [{ siret: '82898347800011', extra2: 'Extra information 2' }]
    await ax.post('/api/v1/datasets/master2/_bulk_lines', items2.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master2')

    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }])
    await workers.hook('finalizer/slave')
    const lines = (await ax.get('/api/v1/datasets/slave/lines')).data
    assert.equal(lines.results[0]['_siret2._siret.extra'], 'Extra information')
    assert.equal(lines.results[0]['_siret2.extra2'], 'Extra information 2')
  })

  it('should handle sorting to chose ambiguous result', async function () {
    const ax = global.ax.superadmin
    await initMaster(
      ax,
      [siretProperty, { key: 'sortKey', type: 'integer' }, { key: 'extra', type: 'string' }],
      [{
        id: 'siret-sort-asc',
        title: 'Fetch extra info from siret while sorting by a key',
        input: [{ type: 'equals', property: siretProperty }],
        sort: 'sortKey'
      }, {
        id: 'siret-sort-desc',
        title: 'Fetch extra info from siret while sorting by a key',
        input: [{ type: 'equals', property: siretProperty }],
        sort: '-sortKey'
      }]
    )

    const items = [
      { siret: '82898347800011', sortKey: 3, extra: 'Extra information 3' },
      { siret: '82898347800011', sortKey: 1, extra: 'Extra information 1' },
      { siret: '82898347800011', sortKey: 2, extra: 'Extra information 2' }
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items)
    await workers.hook('finalizer/master')

    const input = [
      { siret: 'blabla' },
      { siret: '82898347800011' }
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

  it('should handle date-in-interval search type', async function () {
    const ax = global.ax.superadmin
    await initMaster(
      ax,
      [startProperty, endProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'date-int',
        title: 'Fetch extra info when date is in interval',
        input: [{ type: 'date-in-interval', property: dateProperty }]
      }]
    )

    const items = [
      { start: '2021-05-12T14:23:15.178Z', end: '2021-05-15T14:23:15.178Z', extra: 'Extra information 1' },
      { start: '2021-05-15T14:23:15.178Z', end: '2021-05-18T14:23:15.178Z', extra: 'Extra information 2' }
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items)
    await workers.hook('finalizer/master')

    const input = [
      { _date: '2021-05-14T14:23:15.178Z' },
      { _date: '2021-05-18T14:23:15.178Z' },
      { _date: '2021-05-25T14:23:15.178Z' }
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

  it('should handle geo-distance search type', async function () {
    const ax = global.ax.superadmin
    await initMaster(
      ax,
      [latlonProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'geo-dist',
        title: 'Fetch info matching geo shape',
        input: [{ type: 'geo-distance', distance: 0, property: geopointProperty }]
      }]
    )

    const items = [
      { latlon: '-2.7,47.6', extra: 'Extra information 1' },
      { latlon: '-2.8,45.5', extra: 'Extra information 2' }
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items)
    await workers.hook('finalizer/master')

    const input = [
      { _geopoint: '-2.7,47.6' },
      { _geopoint: '-2.8,45.5' },
      { _geopoint: '-2.7,49' }
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

  it('should prevent using master-data without access to remote service', async function () {
    const { remoteService } = await initMaster(
      global.ax.dmeadus,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    // create slave dataset
    await global.ax.cdurning2.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra']
      }]
    })
    await assert.rejects(workers.hook('finalizer/slave'), err => err.message.startsWith('Try to apply extension'))
  })

  it('should prevent using master-data without permission on dataset', async function () {
    const { remoteService } = await initMaster(
      global.ax.dmeadus,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    // only super admin can open remote service to public
    await assert.rejects(global.ax.dmeadus.patch('/api/v1/remote-services/' + remoteService.id, { public: true }), (err) => err.status === 403)
    global.ax.superadmin.patch('/api/v1/remote-services/' + remoteService.id, { public: true })

    // create slave dataset
    await global.ax.cdurning2.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra']
      }]
    })
    await global.ax.cdurning2.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    await assert.rejects(workers.hook('finalizer/slave'), err => err.message.startsWith('permission manquante'))
  })

  it('should support using master-data from other account if visibility is ok', async function () {
    const { remoteService, master } = await initMaster(
      global.ax.dmeadus,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )
    // feed some data to the master
    const items = [{ siret: '82898347800011', extra: 'Extra information' }]
    await global.ax.dmeadus.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/master')

    // only super admin can open remote service to public
    await assert.rejects(global.ax.dmeadus.patch('/api/v1/remote-services/' + remoteService.id, { public: true }), (err) => err.status === 403)
    global.ax.superadmin.patch('/api/v1/remote-services/' + remoteService.id, { public: true })
    // owner of the master-data dataset can open it to public
    await global.ax.dmeadus.put(`/api/v1/datasets/${master.id}/permissions`, [{ classes: ['read'] }])

    // create slave dataset
    await global.ax.cdurning2.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra']
      }]
    })
    await global.ax.cdurning2.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    await workers.hook('finalizer/slave')
    const results = (await global.ax.cdurning2.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
  })

  it('should support chaining extensions', async function () {
    const ax = global.ax.dmeadus
    const { remoteService } = await initMaster(
      ax,
      [latlonProperty, countryProperty],
      [{
        id: 'geo',
        title: 'Fetch info matching geo shape',
        input: [{ type: 'geo-distance', distance: 0, property: geopointProperty }]
      }],
      'master1'
    )
    assert.equal(remoteService.actions[0].input.length, 2)
    const { remoteService: remoteService2 } = await initMaster(
      ax,
      [countryProperty, { key: 'name', type: 'string' }],
      [{
        id: 'country',
        title: 'Fetch extra info from country',
        description: '',
        input: [{ type: 'equals', property: countryProperty }]
      }],
      'master2'
    )
    await ax.post('/api/v1/datasets/master1/_bulk_lines', [
      { latlon: '-2.7,47.6', country: 'FRA' },
      { latlon: '-2.8,45.5', country: 'JPN' }
    ])
    await workers.hook('finalizer/master1')
    await ax.post('/api/v1/datasets/master2/_bulk_lines', [
      { country: 'FRA', name: 'France' },
      { country: 'JPN', name: 'Japan' }
    ])
    await workers.hook('finalizer/master2')

    // create slave dataset
    const slave = (await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      // latlonProperty will be calculated
      // then countryProperty will be deduced from first level extension
      // then country name will be deduced from second level extension
      schema: [latProperty, lonProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_geo',
        select: ['country']
      }, {
        active: true,
        type: 'remoteService',
        remoteService: remoteService2.id,
        action: 'masterData_bulkSearch_country',
        select: ['name']
      }]
    })).data
    assert.ok(slave.schema.find(p => p.key === '_geopoint'))
    assert.ok(slave.schema.find(p => p.key === '_geo.country'))
    assert.ok(slave.schema.find(p => p.key === '_country.name'))
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [
      { lat: '-2.7', long: '47.6' },
      { lat: '-2.8', lon: '45.5' }
    ])
    await workers.hook('finalizer/slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_geo.country'], 'JPN')
    assert.equal(results[0]['_country.name'], 'Japan')

    // same test but with a file based dataset
    const form = new FormData()
    const csvSlave = `lat,lon
-2.8,45.5
`
    form.append('dataset', csvSlave, 'slave.csv')
    const slaveFile = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    await workers.hook(`finalizer/${slaveFile.id}`)
    let lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    await ax.patch(`/api/v1/datasets/${slaveFile.id}`, {
      // latlonProperty will be calculated
      // then countryProperty will be deduced from first level extension
      // then country name will be deduced from second level extension
      schema: [latProperty, lonProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_geo',
        select: ['country']
      }, {
        active: true,
        type: 'remoteService',
        remoteService: remoteService2.id,
        action: 'masterData_bulkSearch_country',
        select: ['name']
      }]
    })
    await workers.hook(`finalizer/${slaveFile.id}`)
    lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    assert.equal(lines[0]['_geo.country'], 'JPN')
    assert.equal(lines[0]['_country.name'], 'Japan')

    // and another time after updating the file dataset
    const form2 = new FormData()
    const csvSlave2 = `lat,lon
-2.7,47.6
`
    form2.append('dataset', csvSlave2, 'slave2.csv')
    await ax.post(`/api/v1/datasets/${slaveFile.id}`, form2, { headers: testUtils.formHeaders(form2) })
    await workers.hook(`finalizer/${slaveFile.id}`)
    lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    assert.equal(lines[0]['_geo.country'], 'FRA')
    assert.equal(lines[0]['_country.name'], 'France')
  })

  it('should listing remote services actions', async function () {
    const ax = global.ax.dmeadus
    const { remoteService } = await initMaster(
      ax,
      [latlonProperty, countryProperty],
      [{
        id: 'geo',
        title: 'Fetch info matching geo shape',
        input: [{ type: 'geo-distance', distance: 0, property: geopointProperty }]
      }],
      'master1'
    )
    const { remoteService: remoteService2 } = await initMaster(
      ax,
      [countryProperty, { key: 'name', type: 'string' }],
      [{
        id: 'country',
        title: 'Fetch extra info from country',
        description: '',
        input: [{ type: 'equals', property: countryProperty }]
      }],
      'master2'
    )
    await ax.post('/api/v1/datasets/master1/_bulk_lines', [
      { latlon: '-2.7,47.6', country: 'FRA' },
      { latlon: '-2.8,45.5', country: 'JPN' }
    ])
    await workers.hook('finalizer/master1')

    await ax.post('/api/v1/datasets/master2/_bulk_lines', [
      { country: 'FRA', name: 'France' },
      { country: 'JPN', name: 'Japan' }
    ])
    await workers.hook('finalizer/master2')

    // create slave dataset
    const slave = (await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [latlonProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_geo',
        select: ['country']
      }, {
        active: true,
        type: 'remoteService',
        remoteService: remoteService2.id,
        action: 'masterData_bulkSearch_country',
        select: ['name']
      }]
    })).data
    assert.ok(slave.schema.find(p => p.key === '_geo.country'))
    assert.ok(slave.schema.find(p => p.key === '_country.name'))

    await ax.post('/api/v1/datasets/slave/_bulk_lines', [
      { latlon: '-2.7,47.6' },
      { latlon: '-2.8,45.5' }
    ])
    await workers.hook('finalizer/slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_geo.country'], 'JPN')
    assert.equal(results[0]['_country.name'], 'Japan')
  })
})
