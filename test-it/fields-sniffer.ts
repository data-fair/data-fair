import { strict as assert } from 'node:assert'
import * as sniffer from '../api/src/datasets/utils/fields-sniffer.js'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import FormData from 'form-data'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset, formHeaders } from './utils/index.ts'
import * as workers from '../api/src/workers/index.ts'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('field sniffer', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Work with booleans', function () {
    assert.equal(sniffer.sniff(['true', 'false']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'False', '1', '-1', 'vrai', 'oui']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', '']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'yes it is']).type, 'string')
    assert.equal(sniffer.format('True', { type: 'boolean' }), true)
    assert.equal(sniffer.format('1', { type: 'boolean' }), true)
    assert.equal(sniffer.format('-1', { type: 'boolean' }), false)
    assert.equal(sniffer.format('vrai', { type: 'boolean' }), true)
    assert.equal(sniffer.format('faux', { type: 'boolean' }), false)
    assert.equal(sniffer.format('oui', { type: 'boolean' }), true)
    assert.equal(sniffer.format('non', { type: 'boolean' }), false)
    assert.equal(sniffer.format('yes', { type: 'boolean' }), true)
    assert.equal(sniffer.format('no', { type: 'boolean' }), false)
  })

  it('Work with numbers', function () {
    assert.equal(sniffer.sniff(['1.1', '2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '22']).type, 'integer')
    assert.equal(sniffer.sniff(['1', '10 426']).type, 'integer')
    assert.equal(sniffer.sniff(['27 589']).type, 'integer') // I don't know what is that whitespace char, but it is not a simple space
    assert.equal(sniffer.sniff(['111', '-2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '20 000.2']).type, 'number')
    assert.equal(sniffer.sniff(['10,10']).type, 'number')
    assert.equal(sniffer.format('-11', { type: 'number' }), -11)
    assert.equal(sniffer.format('-1', { type: 'integer' }), -1)
    assert.equal(sniffer.format('10 426', { type: 'integer' }), 10426)
    assert.equal(sniffer.format('20 000.2', { type: 'number' }), 20000.2)
    assert.equal(sniffer.format('27 589', { type: 'integer' }), 27589)
    assert.equal(sniffer.format('10,10', { type: 'number' }), 10.1)
    assert.equal(sniffer.sniff(['_0', '   10 426']).type, 'integer')
  })

  it('Work with dates', function () {
    assert.deepEqual(sniffer.sniff([' 2017-11-29', '2017-12-12']), { type: 'string', format: 'date' })
    assert.deepEqual(sniffer.sniff([' 2017-11-29T12:24:36.816Z ']), { type: 'string', format: 'date-time' })
    assert.deepEqual(sniffer.sniff(['2019-11-14T14:00:12']), { type: 'string', format: 'date-time', dateTimeFormat: 'YYYY-MM-DDTHH:mm:ss' })
  })

  it('Work with keywords and texts', function () {
    assert.deepEqual(sniffer.sniff(['id1', 'id2']), { type: 'string' })
    assert.deepEqual(sniffer.sniff(['id1', 'a text with whitespaces']), { type: 'string' })
  })

  it('Default type is empty (will be removed from schema)', function () {
    assert.deepEqual(sniffer.sniff([]), { type: 'empty' })
  })

  it('escape key algorithme should normalize column keys', function () {
    assert.equal(sniffer.escapeKey('TEST'), 'test')
    assert.equal(sniffer.escapeKey('test 1'), 'test_1')
    assert.equal(sniffer.escapeKey('Superficie des logements >100 m2'), 'superficie_des_logements_greater100_m2')
    assert.equal(sniffer.escapeKey('Superficie des logements >100 m2', 'compat-ods'), 'superficie_des_logements_100_m2')
    assert.equal(sniffer.escapeKey('Nombre d\'habitants', 'compat-ods'), 'nombre_d_habitants')
    assert.equal(sniffer.escapeKey('Consommation HTA  - Segments C1+C2+C3', 'compat-ods'), 'consommation_hta_segments_c1_c2_c3')
    assert.equal(sniffer.escapeKey('Société', 'compat-ods'), 'societe')
    assert.equal(sniffer.escapeKey('Température normale lissée (°C)', 'compat-ods'), 'temperature_normale_lissee_degc')
    assert.equal(sniffer.escapeKey('Thermosensibilité moyenne (kWh DJU)', 'compat-ods'), 'thermosensibilite_moyenne_kwh_dju')
  })

  it('Detect and parse text formats', async function () {
    const ax = dmeadus
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

  it('Detect and parse usual french date formats', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter(f => !f['x-calculated']).length, 4)
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

  it('Detect ISO date in a version of the file, then update format in next version', async function () {
    const ax = dmeadus
    let form = new FormData()
    form.append('file', 'str,date\nstrval,2021-01-22', 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    let dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '2021-01-22')

    form = new FormData()
    form.append('file', 'str,date\nstrval,28/11/1983', 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: formHeaders(form) })
    dataset = await workers.hook(`finalize/${res.data.id}`)
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
    const ax = dmeadus
    const form = new FormData()
    let data = 'periode;source;elec_3;elec_6;elec_tt;gaz_b0;gaz_b1;gaz_b2i;gaz_tt;propane;fod_c1;essence;ars;sp95;sp98;gazole;gplc;vap_t100;vap_t110;bois_vrac;bois_sac;brent;ipe;dollar;charbon;pet_brut_e;pet_brut_d;pet_raf_e;elec_exp;PEG_gaz_2022;PEG_gaz_2023;PEG_gaz_2024;PEG_gaz_2025;Baseload_elec_2022;Baseload_elec_2023;Baseload_elec_2024;Baseload_elec_2025;Prix_tonne_CO2'
    data += '\n\r\t01/07/2021;AAA;;;;;;;;;;;;;;;;;;;;;;;;;;;;11,11;11,11;11,11;;;;;;'
    form.append('file', data, 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    const dateProp = dataset.file.schema.find(p => p.key === 'periode')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.results[0].periode, '2021-07-01')
  })

  it('Accept ISO date without Z or timezone suffix', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,2021-02-23T10:27:50', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DDTHH:mm:ss')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '2021-02-23T10:27:50+01:00')

    const valuesAgg = (await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=datetime`)).data
    assert.equal(valuesAgg.aggs[0].value, '2021-02-23T10:27:50+01:00')
  })

  it('Accept date detected as ISO by JS but not by elasticsearch', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', 'str,datetime\nstrval,1961-02-13 00:00:00+00:00', 'dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '1961-02-13T00:00:00+00:00')
  })

  it('Accept another date-time format and configure timezone', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/date-time.csv', ax)
    const dateProp = dataset.file.schema.find(p => p.key === 'horodatage')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')
    assert.equal(dateProp.dateTimeFormat, 'YYYY-MM-DD HH:mm:ss')

    let results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00+01:00')

    dataset.schema.find(field => field.key === 'horodatage').timeZone = 'Pacific/Honolulu'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    await workers.hook(`finalize/${dataset.id}`)

    results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].horodatage, '2050-01-01T00:00:00-10:00')
  })

  it('Accept formatted date in geojson', async function () {
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
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    const dateProp = dataset.file.schema.find(p => p.key === 'date')
    assert.equal(dateProp.dateFormat, 'YYYY/M/D')
  })
})
