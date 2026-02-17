import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, formHeaders } from './utils/index.ts'
import FormData from 'form-data'

describe('Date formats', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Detect and parse usual french date formats', async function () {
    const ax = dmeadus
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

  it('Detect ISO date in a version of the file, then update format in next version', async function () {
    const ax = dmeadus
    let form = new FormData()
    form.append('file', 'str,date\nstrval,2021-01-22', 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    let dateProp = dataset.file.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, undefined)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].date, '2021-01-22')

    form = new FormData()
    form.append('file', 'str,date\nstrval,28/11/1983', 'dataset.csv')
    res = await ax.post(`/api/v1/datasets/${dataset.id}`, form, { headers: formHeaders(form) })
    dataset = await workers.hook(`finalize/${res.data.id}`)
    dateProp = dataset.file.schema.find((p: any) => p.key === 'date')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date')
    assert.equal(dateProp.dateFormat, 'D/M/YYYY')
    dateProp = dataset.schema.find((p: any) => p.key === 'date')
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
    const workers = await import('../api/src/workers/index.ts')
    let dataset = await workers.hook(`finalize/${res.data.id}`)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'periode')
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
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'datetime')
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
    const workers = await import('../api/src/workers/index.ts')
    const dataset = await workers.hook(`finalize/${res.data.id}`)
    const dateProp = dataset.file.schema.find((p: any) => p.key === 'datetime')
    assert.equal(dateProp.type, 'string')
    assert.equal(dateProp.format, 'date-time')

    const results = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(results[0].datetime, '1961-02-13T00:00:00+00:00')
  })
})
