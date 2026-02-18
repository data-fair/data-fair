import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders, sendDataset } from './utils/index.ts'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'
import exprEval from '../shared/expr-eval.js'
import fs from 'fs-extra'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

const { parser, compile } = exprEval('Europe/Paris')

describe('file datasets with transformation rules', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should evaluate simple expressions', function () {
    assert.equal(parser.parse('a + b').evaluate({ a: 1, b: 2 }), 3)
    assert.equal(parser.parse('UPPER(a)').evaluate({ a: 'a' }), 'A')
    assert.equal(parser.parse('LOWER(a)').evaluate({ a: 'A' }), 'a')
    assert.equal(parser.parse('REPLACE(a,"A",b)').evaluate({ a: 'aAa', b: 'B' }), 'aBa')
    assert.equal(parser.parse('REPLACE(a,"A",b)').evaluate({ a: 'aAaAa', b: 'BA' }), 'aBAaBAa')
    assert.equal(parser.parse('REPLACE(a,"A\\u005C","B")').evaluate({ a: 'aA\\a', b: 'B' }), 'aBa')
    assert.equal(parser.parse('TITLE(a)').evaluate({ a: 'my title' }), 'My Title')
    assert.equal(parser.parse('PHRASE(a)').evaluate({ a: 'my phrase' }), 'My phrase')
    assert.equal(parser.parse('PAD_RIGHT(a, 5, "-")').evaluate({ a: 'ABC' }), 'ABC--')
    assert.equal(parser.parse('PAD_LEFT(a, 5, "-")').evaluate({ a: 'ABC' }), '--ABC')
    assert.equal(parser.parse('SLUG(a)').evaluate({ a: 'My title' }), 'my-title')
    assert.equal(parser.parse('SLUG(a, "_")').evaluate({ a: 'My title' }), 'my_title')

    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop")').evaluate({ a: '{"prop": "My prop"}' }), 'My prop')
    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop2")').evaluate({ a: '{"prop": "My prop"}' }), undefined)
    assert.equal(parser.parse('GET(JSON_PARSE(a), "prop2")').evaluate({ a: '' }), undefined)

    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: 'aAb' }), 1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: 'A', a: null }), -1)
    assert.equal(parser.parse('STRPOS(a, x)').evaluate({ x: true, a: 'aAb' }), -1)

    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: 'b' }), '86bfbbec238b3cb49c45ba78b02cd940')
    assert.equal(parser.parse('MD5(a, b)').evaluate({ a: 'a', b: null }), '60921ff7863149ffa56c3947807e17e6')
    assert.equal(parser.parse('JOIN(SPLIT(a, "-"), "_")').evaluate({ a: 'a-b-c' }), 'a_b_c')
    assert.equal(parser.parse('JOIN(SPLIT(a, "-"), "\n")').evaluate({ a: 'a-b-c' }), `a
b
c`)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "DD/MM/YYYY")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), '07/05/2024')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY")').evaluate({ a: '07/05/2024' }), '2024-05-07T00:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "DD/MM/YYYY", "", "America/Toronto")').evaluate({ a: '07/05/2024' }), '2024-05-07T06:00:00+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "X")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "", "x")').evaluate({ a: '2024-05-07T12:13:37+02:00' }), 1715076817000)
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: 1715076817 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "x")').evaluate({ a: 1715076817000 }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: '1715076817' }), '2024-05-07T12:13:37+02:00')
    assert.equal(parser.parse('TRANSFORM_DATE(a, "X")').evaluate({ a: null }), null)
    assert.equal(parser.parse('join("-", filter(f(item) = item, [a, b, c]))').evaluate({ a: 'a', b: '', c: 'c' }), 'a-c')
    assert.equal(parser.parse('join("-", filter(TRUTHY, [a, b, c]))').evaluate({ a: 'a', b: '', c: 'c' }), 'a-c')
    assert.equal(parser.parse('join("-", filter(DEFINED, [a, b, c]))').evaluate({ a: true, b: null, c: false }), 'true-false')

    assert.equal(parser.parse('EXTRACT(a, "<", ">")').evaluate({ a: 'Hello <world>' }), 'world')
    assert.equal(parser.parse('EXTRACT(a, "statut: ", "\n")').evaluate({
      a: `statut: test
bla bla`
    }), 'test')

    assert.equal(compile('a', { type: 'string' })({ a: 11 }), '11')
    assert.equal(compile('a', { type: 'number' })({ a: '11' }), 11)
    assert.equal(compile('CONCAT(a,";",a)', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'number', separator: ';' })({ a: '11' }), '11;11')
    assert.equal(compile('[a,a]', { type: 'string', format: 'date', separator: ';' })({ a: '2024-11-11' }), '2024-11-11;2024-11-11')
    assert.equal(compile('a', { type: 'string', format: 'date-time' })({ a: '1961-02-13 00:00:00+00:00' }), '1961-02-13T00:00:00+00:00')
    assert.throws(() => compile('a', { key: 'e', type: 'string', format: 'date' })({ a: '11' }), { message: '/e doit correspondre au format "date" (date) (résultat : "11")' })
    assert.equal(compile('a', { type: 'string' })({ a: null }), null)
    assert.throws(() => compile('a', { key: 'e', type: 'string', 'x-required': true })({ a: null }), { message: 'requiert la propriété e (e) (résultat : null)' })
  })

  it('create a dataset and apply a simple transformation', async function () {
    const form = new FormData()
    form.append('file', 'id\n Test\nTest2', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, 'Test')
    assert.equal(lines[1].id, 'Test2')

    const schema = dataset.schema
    schema[0]['x-transform'] = { expr: 'PAD_LEFT(LOWER(value), 6, "0")' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, '00test')
    assert.equal(lines[1].id, '0test2')
  })

  it('create a dataset and overwrite the type of 2 columns and add an extension', async function () {
    const form = new FormData()
    form.append('file', 'id,col1,col2\ntest,val,2025-04-03T18:00:00+02:00\ntest2,val,\n,val,2025-04-03T19:00:00+02:00', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[2].type, 'string')
    assert.equal(dataset.schema[2].format, 'date-time')

    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'boolean', expr: 'value == "test"' }
    schema[2]['x-transform'] = { type: 'string', expr: 'EXTRACT(value,"T","+")' }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, {
      schema,
      extensions: [
        {
          active: true,
          type: 'exprEval',
          expr: 'CONCATENATE(col1, "_", col2)',
          property: {
            key: 'concat',
            type: 'string'
          }
        }
      ]
    })).data
    assert.equal(dataset.status, 'validated')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].type, 'boolean')
    assert.equal(dataset.schema[2].type, 'string')
    assert.equal(dataset.schema[2].format, undefined)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0].id, true)
    assert.equal(lines[0].col2, '18:00:00')
    assert.equal(lines[1].id, false)
    assert.equal(lines[1].col2, undefined)
    assert.equal(lines[2].id, undefined)
    assert.equal(lines[2].col2, '19:00:00')

    const form2 = new FormData()
    form2.append('file', 'id,col1,col2\ntest,val,2025-04-03T16:00:00+02:00\ntest2,val', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })).data
    assert.equal(dataset.status, 'loaded')
    dataset = await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, true)
    assert.equal(lines[0].col2, '16:00:00')
    assert.equal(lines[1].id, false)
    assert.equal(lines[1].col2, undefined)
  })

  it('create a XLSX dataset and apply a transformation on a column', async function () {
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/date-time.xlsx'), 'dataset1.xlsx')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01T00:00:00.000Z')
    assert.equal(lines[1].horodatage, '2050-01-01T01:00:00.000Z')

    const schema = dataset.schema
    const col = schema.find(p => p.key === 'horodatage')
    col['x-transform'] = { type: 'string', format: 'date', expr: 'SUBSTRING(value, 0, 10)' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01')
    assert.equal(lines[1].horodatage, '2050-01-01')
  })

  it('create manage transform type error', async function () {
    const form = new FormData()
    form.append('file', 'id,col1,col2\ntest,val,2025-04-03T18:00:00+02:00\ntest2,val,\n,val,2025-04-03T19:00:00+02:00', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)

    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'number', expr: '"test"' }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    const message = 'échec de l\'évaluation de l\'expression ""test"" : /id doit être de type number (résultat : "test")'
    await assert.rejects(workers.hook('finalize/' + dataset.id), { message: '[noretry] ' + message })
    const journal = await ax.get('/api/v1/datasets/' + dataset.id + '/journal').then(r => r.data)
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[0].data, message)
  })

  it('reload file with transform_date expression', async function () {
    const form = new FormData()
    form.append('file', 'horodate\n2025-11-10 22:30', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook('finalize/' + dataset.id)

    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[0].format, undefined)
    dataset.schema[0]['x-transform'] = {
      expr: 'TRANSFORM_DATE(value, "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm:ssZ", "UTC", "Europe/Paris")',
      type: 'string',
      format: 'date-time'
    }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })).data
    assert.equal(dataset.status, 'analyzed')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[0].format, 'date-time')
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:30:00+01:00')

    const form2 = new FormData()
    form2.append('file', 'horodate\n2025-11-10 22:35', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })).data
    assert.equal(dataset.status, 'loaded')
    await workers.hook('finalize/' + dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:35:00+01:00')

    const extensions = [{
      active: true,
      type: 'exprEval',
      expr: "EXTRACT(horodate, '', '-')",
      property: {
        key: 'annee',
        'x-originalName': 'annee',
        type: 'string',
        'x-capabilities': {
          textAgg: false
        },
        maxLength: 200
      }
    }]
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { extensions })).data
    await workers.hook('finalize/' + dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:35:00+01:00')
    let full = (await ax.get('/api/v1/datasets/' + dataset.id + '/full')).data
    assert.equal(full, 'horodate,annee\n2025-11-10T23:35:00+01:00,2025\n')

    const form3 = new FormData()
    form3.append('file', 'horodate\n2025-11-10 22:40', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    await workers.hook('finalize/' + dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:40:00+01:00')
    full = (await ax.get('/api/v1/datasets/' + dataset.id + '/full')).data
    assert.equal(full, 'horodate,annee\n2025-11-10T23:40:00+01:00,2025\n')
  })

  it('Should add special calculated fields', async function () {
    const ax = dmeadus

    // 1 dataset in user zone
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.ok(dataset.schema.find(f => f.key === '_id' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find(f => f.key === '_i' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find(f => f.key === '_rand' && f['x-calculated'] === true))

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: '_id,_i,_rand,id' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._i, 1)
    assert.equal(res.data.results[1]._i, 2)
    assert.ok(res.data.results[0]._rand)
    assert.ok(res.data.results[0]._id)
  })

  it('Should split by separator if specified', async function () {
    const ax = dmeadus

    // 1 dataset in user zone
    const dataset = await sendDataset('datasets/split.csv', ax)
    // keywords columns is not splitted, so only searchable through full text subfield
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords.text:opendata' } })
    assert.equal(res.data.total, 1)

    // Update schema to specify separator for keywords col
    const keywordsProp = dataset.schema.find(p => p.key === 'keywords')
    keywordsProp.separator = ' ; '
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook('finalize/' + dataset.id)
    // result is rejoined by default
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].keywords, 'informatique ; opendata ; sas')
    // arrays is preserved if using ?arrays=true
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata', arrays: true } })
    assert.equal(res.data.total, 1)
    assert.deepEqual(res.data.results[0].keywords, ['informatique', 'opendata', 'sas'])

    // agregations work with the splitted values
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=keywords`)
    assert.equal(res.data.aggs.find(agg => agg.value === 'opendata').total, 1)
  })
})
