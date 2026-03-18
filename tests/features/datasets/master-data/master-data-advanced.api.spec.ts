// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, waitForDatasetError } from '../../../support/workers.ts'
import FormData from 'form-data'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const cdurning2 = await axiosAuth('cdurning2@desdev.cn')

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

  const remoteService = (await superadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })).data

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

test.describe('master data - Multi-level extensions, sorting, date-interval/geo-distance search, chaining, permissions', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('return multiple levels of extended properties', async () => {
    const ax = superadmin

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
    assert.ok(slave.schema.find((p: any) => p.key === '_siret2.extra2'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret2.siret'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret2._error'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret2._siret.extra'))
    assert.ok(slave.schema.find((p: any) => p.key === '_siret2._siret.siret'))
    assert.ok(!slave.schema.find((p: any) => p.key === '_siret2._siret._error'))

    // feed some data to the masters
    const items = [{ siret: '82898347800011', extra: 'Extra information' }]
    await ax.post('/api/v1/datasets/master1/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await waitForFinalize(ax, 'master1')
    const items2 = [{ siret: '82898347800011', extra2: 'Extra information 2' }]
    await ax.post('/api/v1/datasets/master2/_bulk_lines', items2.map(item => ({ _id: item.siret, ...item })))
    await waitForFinalize(ax, 'master2')

    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }])
    await waitForFinalize(ax, 'slave')
    const lines = (await ax.get('/api/v1/datasets/slave/lines')).data
    assert.equal(lines.results[0]['_siret2._siret.extra'], 'Extra information')
    assert.equal(lines.results[0]['_siret2.extra2'], 'Extra information 2')
  })

  test('should handle sorting to chose ambiguous result', async () => {
    const ax = superadmin
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
    await waitForFinalize(ax, 'master')

    const input = [
      { siret: 'blabla' },
      { siret: '82898347800011' }
    ]
    const resultsAsc = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/siret-sort-asc',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
    ).data.split('\n').filter((line: string) => !!line).map((line: string) => JSON.parse(line))
    assert.equal(resultsAsc[0]._key, 0)
    assert.ok(resultsAsc[0]._error.includes('pas de ligne'))
    assert.equal(resultsAsc[1]._key, 1)
    assert.equal(resultsAsc[1].extra, 'Extra information 1')

    const resultsDesc = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/siret-sort-desc',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' } })
    ).data.split('\n').filter((line: string) => !!line).map((line: string) => JSON.parse(line))
    assert.equal(resultsDesc[0]._key, 0)
    assert.ok(resultsDesc[0]._error.includes('pas de ligne'))
    assert.equal(resultsDesc[1]._key, 1)
    assert.equal(resultsDesc[1].extra, 'Extra information 3')
  })

  test('should handle date-in-interval search type', async () => {
    const ax = superadmin
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
    await waitForFinalize(ax, 'master')

    const input = [
      { _date: '2021-05-14T14:23:15.178Z' },
      { _date: '2021-05-18T14:23:15.178Z' },
      { _date: '2021-05-25T14:23:15.178Z' }
    ]
    const results = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/date-int',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
    ).data.split('\n').filter((line: string) => !!line).map((line: string) => JSON.parse(line))
    assert.equal(results[0].extra, 'Extra information 1')
    assert.equal(results[1].extra, 'Extra information 2')
    assert.ok(results[2]._error.includes('pas de ligne'))
  })

  test('should handle geo-distance search type', async () => {
    const ax = superadmin
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
    await waitForFinalize(ax, 'master')

    const input = [
      { _geopoint: '-2.7,47.6' },
      { _geopoint: '-2.8,45.5' },
      { _geopoint: '-2.7,49' }
    ]
    const results = (await ax.post(
      '/api/v1/datasets/master/master-data/bulk-searchs/geo-dist',
      input.map(line => JSON.stringify(line)).join('\n'),
      { headers: { 'Content-Type': 'application/x-ndjson' }, params: { select: 'extra' } })
    ).data.split('\n').filter((line: string) => !!line).map((line: string) => JSON.parse(line))
    assert.equal(results[0].extra, 'Extra information 1')
    assert.equal(results[1].extra, 'Extra information 2')
    assert.ok(results[2]._error.includes('pas de ligne'))
  })

  test('should prevent using master-data without access to remote service', async () => {
    const { remoteService } = await initMaster(
      dmeadus,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    // create slave dataset
    await cdurning2.put('/api/v1/datasets/slave', {
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
    await cdurning2.post('/api/v1/datasets/slave/_bulk_lines?drop=true', [{ siret: '82898347800011' }])
    await waitForDatasetError(cdurning2, 'slave')
    const journal = (await cdurning2.get('/api/v1/datasets/slave/journal')).data
    assert.ok(journal[0].data.startsWith('Try to apply extension'))
  })

  test('should prevent using master-data without permission on dataset', async () => {
    const { remoteService } = await initMaster(
      dmeadus,
      [siretProperty, { key: 'extra', type: 'string' }],
      [{
        id: 'siret',
        title: 'Fetch extra info from siret',
        description: '',
        input: [{ type: 'equals', property: siretProperty }]
      }]
    )

    // only super admin can open remote service to public
    await assert.rejects(dmeadus.patch('/api/v1/remote-services/' + remoteService.id, { public: true }), (err: any) => err.status === 403)
    superadmin.patch('/api/v1/remote-services/' + remoteService.id, { public: true })

    // create slave dataset
    await cdurning2.put('/api/v1/datasets/slave', {
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
    await cdurning2.post('/api/v1/datasets/slave/_bulk_lines?drop=true', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    await assert.rejects(waitForFinalize(dmeadus, 'slave'), (err: any) => err.message.startsWith('permission manquante'))
  })

  test('should support using master-data from other account if visibility is ok', async () => {
    const { remoteService, master } = await initMaster(
      dmeadus,
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
    await dmeadus.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))
    await waitForFinalize(dmeadus, 'master')

    // only super admin can open remote service to public
    await assert.rejects(dmeadus.patch('/api/v1/remote-services/' + remoteService.id, { public: true }), (err: any) => err.status === 403)
    superadmin.patch('/api/v1/remote-services/' + remoteService.id, { public: true })
    // owner of the master-data dataset can open it to public
    await dmeadus.put(`/api/v1/datasets/${master.id}/permissions`, [{ classes: ['read'] }])

    // create slave dataset
    await cdurning2.put('/api/v1/datasets/slave', {
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
    await cdurning2.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    await waitForFinalize(cdurning2, 'slave')
    const results = (await cdurning2.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_siret.extra'], 'Extra information')
  })

  test('should support chaining extensions', async () => {
    const ax = dmeadus
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
    await waitForFinalize(ax, 'master1')
    await ax.post('/api/v1/datasets/master2/_bulk_lines', [
      { country: 'FRA', name: 'France' },
      { country: 'JPN', name: 'Japan' }
    ])
    await waitForFinalize(ax, 'master2')

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
    assert.ok(slave.schema.find((p: any) => p.key === '_geopoint'))
    assert.ok(slave.schema.find((p: any) => p.key === '_geo.country'))
    assert.ok(slave.schema.find((p: any) => p.key === '_country.name'))
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [
      { lat: '-2.7', long: '47.6' },
      { lat: '-2.8', lon: '45.5' }
    ])
    await waitForFinalize(ax, 'slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_geo.country'], 'JPN')
    assert.equal(results[0]['_country.name'], 'Japan')

    // same test but with a file based dataset
    const form = new FormData()
    const csvSlave = `lat,lon
-2.8,45.5
`
    form.append('dataset', csvSlave, 'slave.csv')
    const slaveFile = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    await waitForFinalize(ax, slaveFile.id)
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
    await waitForFinalize(ax, slaveFile.id)
    lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    assert.equal(lines[0]['_geo.country'], 'JPN')
    assert.equal(lines[0]['_country.name'], 'Japan')

    // and another time after updating the file dataset
    const form2 = new FormData()
    const csvSlave2 = `lat,lon
-2.7,47.6
`
    form2.append('dataset', csvSlave2, 'slave2.csv')
    await ax.post(`/api/v1/datasets/${slaveFile.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    await waitForFinalize(ax, slaveFile.id)
    lines = (await ax.get(`/api/v1/datasets/${slaveFile.id}/lines`)).data.results
    assert.equal(lines[0]['_geo.country'], 'FRA')
    assert.equal(lines[0]['_country.name'], 'France')
  })

  test('should list remote services actions', async () => {
    const ax = dmeadus
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
    await waitForFinalize(ax, 'master1')

    await ax.post('/api/v1/datasets/master2/_bulk_lines', [
      { country: 'FRA', name: 'France' },
      { country: 'JPN', name: 'Japan' }
    ])
    await waitForFinalize(ax, 'master2')

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
    assert.ok(slave.schema.find((p: any) => p.key === '_geo.country'))
    assert.ok(slave.schema.find((p: any) => p.key === '_country.name'))

    await ax.post('/api/v1/datasets/slave/_bulk_lines', [
      { latlon: '-2.7,47.6' },
      { latlon: '-2.8,45.5' }
    ])
    await waitForFinalize(ax, 'slave')
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_geo.country'], 'JPN')
    assert.equal(results[0]['_country.name'], 'Japan')
  })
})
