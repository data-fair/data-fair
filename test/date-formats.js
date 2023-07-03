const assert = require('assert').strict
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('Date formats', () => {
  it('Detect and parse usual french date formats', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter(f => !f['x-calculated']).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0].date, '2021-01-13')
    assert.equal(res.data.results[0].datefr, '2021-01-13')
    assert.equal(res.data.results[0].datetime, '2021-01-13T19:42:02.790Z')
    assert.ok(res.data.results[0].datetimefr.startsWith('2021-01-13T'))

    assert.equal(res.data.results[2].date, '2021-01-15')
    assert.equal(res.data.results[2].datefr, '2021-01-15')
    assert.equal(res.data.results[2].datetime, '2021-01-15T19:42:02.790Z')
    assert.ok(res.data.results[2].datetimefr.startsWith('2021-01-15T'))
  })

  it('Detect ISO date in a version of the file, then update format in next version', async function () {
    const ax = global.ax.dmeadus
    let form = new FormData()
    form.append('file', 'str,date\nstrval,2021-01-22', 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    let dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '2021-01-22')

    form = new FormData()
    form.append('file', 'str,date\nstrval,28/11/1983', 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: testUtils.formHeaders(form) })
    dataset = await workers.hook(`finalizer/${res.data.id}`)
    dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    // date input formatting does not belong to dataset.schema, but only dataset.file.schema
    dateProp = dataset.schema.find(p => p.key === 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '1983-11-28')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/api-docs.json`)
    res = await ax.post('/api/v1/_check-api', res.data)
  })

  it('Detect date format while ignoring whitespace', async function () {
    const ax = global.ax.dmeadus
    const form = new FormData()
    let data = 'periode;source;elec_3;elec_6;elec_tt;gaz_b0;gaz_b1;gaz_b2i;gaz_tt;propane;fod_c1;essence;ars;sp95;sp98;gazole;gplc;vap_t100;vap_t110;bois_vrac;bois_sac;brent;ipe;dollar;charbon;pet_brut_e;pet_brut_d;pet_raf_e;elec_exp;PEG_gaz_2022;PEG_gaz_2023;PEG_gaz_2024;PEG_gaz_2025;Baseload_elec_2022;Baseload_elec_2023;Baseload_elec_2024;Baseload_elec_2025;Prix_tonne_CO2'
    data += '\n\r\t01/07/2021;AAA;;;;;;;;;;;;;;;;;;;;;;;;;;;;11,11;11,11;11,11;;;;;;'
    form.append('file', data, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    const dateProp = dataset.file.schema.find(p => p.key === 'periode')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.results[0].periode, '2021-07-01')
  })

  it('Accept ISO date without Z or timezone suffix', async function () {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,2021-02-23T10:27:50', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = await workers.hook(`finalizer/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DDTHH:mm:ss')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '2021-02-23T10:27:50+01:00')
  })

  it('Accept date detected as ISO by JS but not by elasticsearch', async function () {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,1961-02-13 00:00:00+00:00', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = await workers.hook(`finalizer/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '1961-02-13T00:00:00+00:00')
  })

  it('Accept another date-time format and configure timezone', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/date-time.csv', ax)
    const dateProp = dataset.file.schema.find(p => p.key === 'horodatage')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DD HH:mm:ss')

    let results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00+01:00')

    dataset.schema.find(field => field.key === 'horodatage').timeZone = 'Pacific/Honolulu'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    await workers.hook(`finalizer/${dataset.id}`)

    results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00-10:00')
  })

  it('Accept formatted date in geojson', async () => {
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
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook(`finalizer/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.dateFormat, 'YYYY/M/D')
  })
})
