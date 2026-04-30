import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { sendDataset, waitForFinalize, doAndWaitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('field sniffer', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Detect and parse text formats', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/text-formats.csv', ax)
    const shortProp = dataset.schema.find((p: any) => p.key === 'short')
    assert.equal(shortProp.type, 'string')
    assert.equal(shortProp['x-display'], undefined)
    assert.ok(!shortProp['x-capabilities'])
    const longProp = dataset.schema.find((p: any) => p.key === 'long')
    assert.equal(longProp.type, 'string')
    assert.equal(longProp['x-display'], 'textarea')
    assert.deepEqual(longProp['x-capabilities'], { index: false, values: false, insensitive: false })
  })

  test('Detect and parse usual french date formats', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter((f: any) => !f['x-calculated']).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0].date, '2021-01-13')
    assert.equal(res.data.results[0].date_fr, '2021-01-13')
    assert.equal(res.data.results[0].datetime, '2021-01-13T19:42:02.790Z')
    assert.ok(res.data.results[0].datetime_fr.startsWith('2021-01-13T'))

    assert.equal(res.data.results[2].date, '2021-01-15')
    assert.equal(res.data.results[2].date_fr, '2021-01-15')
    assert.equal(res.data.results[2].datetime, '2021-01-15T19:42:02.790Z')
    assert.ok(res.data.results[2].datetime_fr.startsWith('2021-01-15T'))
  })

  test('Detect ISO date in a version of the file, then update format in next version', async () => {
    const ax = testUser1
    let form = new FormData()
    form.append('file', 'str,date\nstrval,2021-01-22', 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)
    let dateProp = dataset.file.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '2021-01-22')

    form = new FormData()
    form.append('file', 'str,date\nstrval,28/11/1983', 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    dataset = await waitForFinalize(ax, res.data.id)
    dateProp = dataset.file.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    // date input formatting does not belong to dataset.schema, but only dataset.file.schema
    dateProp = dataset.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '1983-11-28')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/api-docs.json`)
    res = await ax.post('/api/v1/_check-api', res.data)
  })

  test('Detect date format while ignoring whitespace', async () => {
    const ax = testUser1
    const form = new FormData()
    let data = 'periode;source;elec_3;elec_6;elec_tt;gaz_b0;gaz_b1;gaz_b2i;gaz_tt;propane;fod_c1;essence;ars;sp95;sp98;gazole;gplc;vap_t100;vap_t110;bois_vrac;bois_sac;brent;ipe;dollar;charbon;pet_brut_e;pet_brut_d;pet_raf_e;elec_exp;PEG_gaz_2022;PEG_gaz_2023;PEG_gaz_2024;PEG_gaz_2025;Baseload_elec_2022;Baseload_elec_2023;Baseload_elec_2024;Baseload_elec_2025;Prix_tonne_CO2'
    data += '\n\r\t01/07/2021;AAA;;;;;;;;;;;;;;;;;;;;;;;;;;;;11,11;11,11;11,11;;;;;;'
    form.append('file', data, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    let dataset = await waitForFinalize(ax, res.data.id)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'periode')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.results[0].periode, '2021-07-01')
  })

  test('Accept ISO date without Z or timezone suffix', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,2021-02-23T10:27:50', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await waitForFinalize(ax, res.data.id)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DDTHH:mm:ss')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '2021-02-23T10:27:50+01:00')

    const valuesAgg = (await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=datetime`)).data
    assert.equal(valuesAgg.aggs[0].value, '2021-02-23T10:27:50+01:00')
  })

  test('Accept date detected as ISO by JS but not by elasticsearch', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,1961-02-13 00:00:00+00:00', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await waitForFinalize(ax, res.data.id)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '1961-02-13T00:00:00+00:00')
  })

  test('Accept another date-time format and configure timezone', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/date-time.csv', ax)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'horodatage')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DD HH:mm:ss')

    let results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00+01:00')

    dataset.schema.find((field: any) => field.key === 'horodatage').timeZone = 'Pacific/Honolulu'
    await doAndWaitForFinalize(ax, dataset.id, async () => {
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    })

    results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00-10:00')
  })

  test('Accept formatted date in geojson', async () => {
    const form = new FormData()
    form.append('file', JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'id1',
          geometry: {
            type: 'LineString',
            coordinates: [[102.0, 0.0], [103.0, 1.0], [104.0, 0.0], [105.0, 1.0]]
          },
          properties: {
            date: '2018/01/01'
          }
        }
      ]
    }), 'geojson-example.geojson')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.dateFormat, 'YYYY/M/D')
  })
})
