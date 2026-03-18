// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, restCollectionFindOne, waitForJournalEvent } from '../../../support/workers.ts'
import FormData from 'form-data'

const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const initMaster = async (ax: any, info: any, masterData: any, id = 'master') => {
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

  const remoteService = (await testSuperadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

  return { master, remoteService, apiDoc }
}

const siretProperty = {
  key: 'siret',
  title: 'Siret',
  type: 'string',
  'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
}

test.describe('master data - Define/use master-data as remote-service, extend geojson, special chars', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should define and use a dataset as master-data remote-service used for extensions', async () => {
    const ax = testSuperadmin

    const { remoteService, apiDoc, master } = await initMaster(
      ax,
      [
        siretProperty,
        {
          key: 'extra',
          type: 'string',
          'x-labels': { value1: 'label1' },
          'x-capabilities': { text: false },
          'x-refersTo': 'http://schema.org/description'
        },
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
    assert.equal(master.schema[0]['x-concept'].id, 'siret')
    assert.equal(master.schema[1]['x-concept'].id, 'description')

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
    await waitForFinalize(ax, 'master')

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

    // create REST slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty]
    })
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800012' }, {}, { siret: '82898347800011' }, { siret: '82898347800011' }])
    await waitForFinalize(ax, 'slave')

    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'extraMulti']
      }]
    })
    await waitForJournalEvent('slave', 'extend-end')
    let slave = await waitForFinalize(ax, 'slave')

    assert.equal(slave.schema[0]['x-concept'].id, 'siret')
    assert.equal(slave.schema[1]['x-concept'].id, 'description')

    let extraProp = slave.schema.find((p: any) => p.key === '_siret.extra')
    assert.ok(extraProp)
    assert.ok(extraProp['x-labels'])
    assert.equal(extraProp['x-labels'].value1, 'label1')
    assert.ok(extraProp['x-capabilities'])
    assert.equal(extraProp['x-capabilities'].text, false)
    assert.equal(extraProp['x-refersTo'], 'http://schema.org/description')
    assert.equal(extraProp['x-concept']?.id, 'description')
    let extraMultiProp = slave.schema.find((p: any) => p.key === '_siret.extraMulti')
    assert.ok(extraMultiProp)
    assert.equal(extraMultiProp.separator, ', ')
    assert.deepEqual(extraMultiProp.enum, ['multi1', 'multi2'])
    assert.ok(slave.schema.find((p: any) => p.key === '_siret._error'))
    assert.ok(!slave.schema.find((p: any) => p.key === '_siret.siret'))
    let results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results.length, 4)
    assert.equal(results[0]['_siret.extra'], 'Extra information')
    assert.equal(results[0]['_siret.extraMulti'], 'multi1, multi2')
    assert.equal(results[1]['_siret.extra'], 'Extra information')
    assert.ok(!results[0]['_siret.siret'])
    results = (await ax.get('/api/v1/datasets/slave/lines', { params: { '_siret.extraMulti_eq': 'multi1' } })).data.results
    assert.equal(results.length, 2)

    // create file slave dataset
    const form = new FormData()
    const csvSlave = `siret
82898347800011
82898347800012
`
    form.append('dataset', csvSlave, 'slave.csv')
    const slaveFile = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    await waitForFinalize(ax, slaveFile.id)
    let lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    await ax.patch(`/api/v1/datasets/${slaveFile.id}`, {
      schema: [siretProperty],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra', 'extraMulti']
      }]
    })
    await waitForFinalize(ax, slaveFile.id)
    extraMultiProp = slave.schema.find((p: any) => p.key === '_siret.extraMulti')
    assert.ok(extraMultiProp)
    assert.equal(extraMultiProp.separator, ', ')
    assert.deepEqual(extraMultiProp.enum, ['multi1', 'multi2'])
    lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    assert.equal(lines[0]['_siret.extraMulti'], 'multi1, multi2')

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
    await waitForFinalize(ax, 'master')
    slave = (await ax.get('/api/v1/datasets/slave')).data
    assert.ok(slave.extensions[0].nextUpdate)
    await ax.patch('/api/v1/datasets/slave', {
      extensions: [{ ...slave.extensions[0], nextUpdate: new Date().toISOString() }]
    })
    await waitForFinalize(ax, 'slave')
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
    slave = await waitForFinalize(ax, 'slave')
    assert.equal(slave.schema.find((p: any) => p.key === '_siret.extra'), undefined)
    extraProp = slave.schema.find((p: any) => p.key === 'siretextra')
    assert.ok(extraProp)
    assert.equal(extraProp['x-refersTo'], 'http://schema.org/description')
    assert.equal(extraProp['x-concept']?.id, 'description')
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
    slave = await waitForFinalize(ax, 'slave')
    assert.equal(slave.schema.find((p: any) => p.key === '_siret.extra'), undefined)
    assert.equal(slave.schema.find((p: any) => p.key === 'siretextra'), undefined)
    extraProp = slave.schema.find((p: any) => p.key === 'siretextextra')
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
    await testSuperadmin.post('/api/v1/datasets/slave/_reindex')
    slave = await waitForFinalize(ax, 'slave')
    assert.equal(slave.schema.find((p: any) => p.key === '_siret.extra'), undefined)
    assert.equal(slave.schema.find((p: any) => p.key === 'siretextra'), undefined)
    extraProp = slave.schema.find((p: any) => p.key === 'siretextextra')

    // re-upload csv that was downloaded extended
    const csv = (await ax.get('/api/v1/datasets/slave/lines?format=csv')).data
    res = await ax.post('/api/v1/datasets/slave/_bulk_lines', csv, { headers: { 'content-type': 'text/csv' } })
    assert.equal(res.data.warnings.length, 1)
    slave = await waitForFinalize(ax, 'slave')

    // patching the dataset to remove extension
    await ax.patch('/api/v1/datasets/slave', {
      extensions: []
    })
    await waitForFinalize(ax, 'slave')
    results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.ok(!results[0]['_siret.extra'])
    assert.ok(!results[0]['siretextextra'])
    assert.ok(!results[0]['siretextra'])
    const doc = await restCollectionFindOne('slave')
    assert.ok(!doc['_siret'])
    assert.ok(!doc['siretextextra'])
    assert.ok(!doc['siretextra'])
  })

  test('accept an input with elasticsearch special chars', async () => {
    const ax = testSuperadmin

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
    await waitForFinalize(ax, 'master')

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
    await waitForFinalize(ax, 'slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
  })

  test('manage query syntax errors', async () => {
    const ax = testSuperadmin

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
    await waitForFinalize(ax, 'master')

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
    let res = await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: 'test " failure' }].map(item => ({ _id: item.siret, ...item })))
    assert.equal(res.data.nbErrors, 1)
    assert.ok(res.data.errors[0].error.includes('Impossible d\'effectuer cette recherche'))

    // in drop mode the lines are not commited immediately
    res = await ax.post('/api/v1/datasets/slave/_bulk_lines?drop=true', [{ siret: 'test " failure' }].map(item => ({ _id: item.siret, ...item })))
    assert.equal(res.data.nbOk, 1)

    await waitForDatasetError(ax, 'slave')

    const journal = (await ax.get('/api/v1/datasets/slave/journal')).data
    assert.ok(journal[0].data.includes('Impossible d\'effectuer cette recherche'))
  })

  test('should extend a geojson file from a master-data dataset', async () => {
    const ax = testSuperadmin

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
    await waitForFinalize(ax, 'master')

    // create a slave from a geojson file
    let geojsonSlave = await sendDataset('datasets/dataset-siret-extensions.geojson', ax)
    geojsonSlave.schema.find((field: any) => field.key === 'siret')['x-refersTo'] = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
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
    geojsonSlave = await waitForFinalize(ax, geojsonSlave.id)
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
    geojsonSlave = await waitForFinalize(ax, geojsonSlave.id)
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

  test('not return calculated properties', async () => {
    const ax = testSuperadmin

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
    const slave = await waitForFinalize(ax, 'slave')
    assert.ok(slave.schema.find((p: any) => p.key === '_siret.extra'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret._error'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret.siret'))
    assert.ok(!slave.schema.find((p: any) => p.key === '_siret._rand'))
  })
})
