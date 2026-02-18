import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, sendDataset } from './utils/index.ts'
import * as workers from '../api/src/workers/index.ts'
import config from 'config'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')

describe('search', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get lines in dataset', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    let res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)
    await workers.hook(`finalize/${dataset.id}`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)

    // Filter on keyword field
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=koumoul`)
    assert.equal(res.data.total, 1)
    // Filter on keyword field and child text field
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=Koumoul`)
    assert.equal(res.data.total, 1)
    // Filter on text field
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lactée`)
    assert.equal(res.data.total, 1)
    // Filter on text field with default french stemming
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté`)
    assert.equal(res.data.total, 1)
    // Filter using q_fields to specify fields to search on
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté&q_fields=adr`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?q=lacté&q_fields=id`)
    assert.equal(res.data.total, 0)
    // filter on exact values with query params suffixed with _in
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_in=koumoul,test`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'koumoul')
    // filter on exact values with query params suffixed with _eq
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_eq=koumoul`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'koumoul')
    // filter on exact values with query params suffixed with _nin
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_nin=koumoul,test`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'bidule')
    // exclude exact values with query params suffixed with _neq
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_neq=koumoul`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].id, 'bidule')
    // perform a full-text search on a column with query params suffixed with _search
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { adr_search: 'lactée' } })
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { adr_search: 'lactée inconnue' } })
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { adr_search: 'lactée +inconnue' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { adr_search: 'lacté' } })
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { adr_search: 'koumoul' } })
    assert.equal(res.data.total, 0)
    // perform a wildcard filter on a column with query params suffixed with _contains
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines?id_contains=oumou`), { status: 400 })
    // perform a prefix filter on a column with query params suffixed with _starts
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_starts=kou`)
    assert.equal(res.data.total, 1)
    // fail to filter on unknown property
    assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines?BADFIELD_in=koumoul`), (err: any) => {
      assert.equal(err.status, 400)
      return true
    })
    // filter on ranges with query params suffixed with _lte, _gte, _lt, _gt
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_gt=cc`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_gte=cc`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?some_date_gt=2017-11-12`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?nb_gt=22`)
    assert.equal(res.data.total, 1)

    // filter on geo info
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?bbox=-2.5,40,3,47`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.75,47.7,10km`)
    assert.ok(res.data.results[0]._geo_distance > 1400)
    assert.ok(res.data.results[0]._geo_distance < 1500)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.75:47.7:10km`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.74,47.7,1`)
    assert.equal(res.data.total, 0)
    // geo_distance without a distance means distance=0 so it is a contains
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.748526,47.687375`)
    assert.equal(res.data.total, 1)
    // sort on distance
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=_geo_distance:2.6:45.5`)
    assert.equal(res.data.results[0].id, 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=-_geo_distance:2.6:45.5`)
    assert.equal(res.data.results[0].id, 'koumoul')
    // geo_distance filter makes the default sort a distance sort
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=2.6,45.5,1000km`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'bidule')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.748526,47.687375,1000km`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')

    // geo queries
    res = await ax.get(`/api/v1/datasets/${dataset.id}/geo_agg?bbox=-3,47,-2,48`)
    assert.equal(res.status, 200)
    assert.equal(res.data.aggs.length, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/geo_agg?bbox=-3,45,3,48`)
    assert.equal(res.status, 200)
    assert.equal(res.data.aggs.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=geojson`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.features.length, 1)
    assert.ok(res.data.features[0].geometry)
    // vector tiles
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=pbf&q=koumoul`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/neighbors/10000')
    assert.equal(res.headers['x-tilesampling'], '1/1')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=3,4,7&format=pbf`)
    assert.equal(res.status, 204)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=pbf&q=koumoul&sampling=max`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'es/max')
    assert.equal(res.headers['x-tilesampling'], '1/1')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=pbf&q=koumoul&sampling=max`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    assert.equal(res.headers['x-tilesmode'], 'cache/max')
    assert.equal(res.headers['x-tilesampling'], '1/1')

    // CSV export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv`)
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8')
    let lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '"id","adr","some date","loc","bool","nb"')
    assert.equal(lines[1], '"koumoul","19 rue de la voie lactée saint avé","2017-12-12","47.687375,-2.748526",0,11')
    locProp.title = 'Localisation'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv`)
    lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '"id","adr","some date","loc","bool","nb"')
    assert.equal(lines[1], '"koumoul","19 rue de la voie lactée saint avé","2017-12-12","47.687375,-2.748526",0,11')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv&sep=;`)
    lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '"id";"adr";"some date";"loc";"bool";"nb"')

    // Sheets exports
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=xlsx`)
    assert.equal(res.headers['content-disposition'], 'attachment; filename="dataset1.xlsx"')
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.ok(Number(res.headers['content-length']) > 5000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=ods`)
    assert.equal(res.headers['content-disposition'], 'attachment; filename="dataset1.ods"')
    assert.equal(res.headers['content-type'], 'application/vnd.oasis.opendocument.spreadsheet')
    assert.ok(Number(res.headers['content-length']) > 5000)

    // Shapefile export
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    } else {
      res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=shp`)
    }
  })

  it('Filter on line existence', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset2.csv', ax)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 6)

    // check existance of property
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_exists`)
    assert.equal(res.data.total, 5)
    assert.equal(res.data.results[0].id, 'koumoul')
    // check non-existance of property
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_nexists`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].adr, 'missing id')
  })

  it('search lines and collapse on field', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/collapsable.csv', ax)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 10)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?collapse=group&size=2&page=2`)
    assert.equal(res.data.totalCollapse, 4)
    assert.equal(res.data.total, 10)
    assert.equal(res.data.results[0].group, 'group3')
    assert.equal(res.data.results[0].grouplabel, 'group 3')

    // Update schema to specify separator for keywords col
    const rolesProp = dataset.schema.find(p => p.key === 'roles')
    rolesProp.separator = ' ; '
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook('finalize/' + dataset.id)

    // collapse on multi-valued property
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines?collapse=roles`), { status: 400 })
  })

  it('sorting can ignore case and diacritics', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/restsort1', {
      isRest: true,
      title: 'restsort1',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'integer' }]
    })

    await ax.post('/api/v1/datasets/restsort1/_bulk_lines', [
      { attr1: 'aaa', attr2: 1 },
      { attr1: 'bbb', attr2: 2 },
      { attr1: 'AAA', attr2: 3 },
      { attr1: 'BBB', attr2: 4 },
      { attr1: 'zzz', attr2: 5 },
      { attr1: 'eee', attr2: 6 },
      { attr1: 'ééé', attr2: 7 }
    ])
    await workers.hook('finalize/restsort1')

    let lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { sort: 'attr1' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['AAA', 'aaa', 'BBB', 'bbb', 'eee', 'ééé', 'zzz'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { sort: '-attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['ééé', 'eee', 'zzz', 'BBB', 'AAA', 'bbb', 'aaa'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { q: 'aaa', sort: 'attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['aaa', 'AAA'])

    lines = await ax.get('/api/v1/datasets/restsort1/lines', { params: { q: 'aaa', sort: '-attr2' } })
    assert.deepEqual(lines.data.results.map(r => r.attr1), ['AAA', 'aaa'])
  })

  it('search and apply facets on topics', async function () {
    const ax = dmeadus

    // 2 datasets in organization zone
    const dataset1 = await sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'topics' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.topics.length, 0)

    // add topics in user settings
    res = await ax.put('/api/v1/settings/user/dmeadus0', { topics: [{ title: 'topics 1' }, { title: 'topics 2' }] })
    const topics = res.data.topics
    await ax.patch('/api/v1/datasets/' + dataset1.id, { topics: [topics[0]] })
    await ax.patch('/api/v1/datasets/' + dataset2.id, { topics })
    res = await ax.get('/api/v1/datasets', { params: { facets: 'topics' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.topics.length, 2)
    assert.equal(res.data.facets.topics[0].count, 2)
    assert.equal(res.data.facets.topics[0].value.id, topics[0].id)
    assert.equal(res.data.facets.topics[1].count, 1)
    assert.equal(res.data.facets.topics[1].value.id, topics[1].id)

    res = await ax.get('/api/v1/datasets', { params: { facets: 'topics', topics: topics[1].id } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.facets.topics.length, 2)
    assert.equal(res.data.facets.topics[0].count, 2)
    assert.equal(res.data.facets.topics[0].value.id, topics[0].id)
    assert.equal(res.data.facets.topics[1].count, 1)
    assert.equal(res.data.facets.topics[1].value.id, topics[1].id)
  })

  it('Truncate results for faster previews', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/truncate1', {
      isRest: true,
      title: 'truncate1',
      schema: [{ key: 'str', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/truncate1/_bulk_lines', [
      { str: 'bla' },
      { str: 'blablabla' }
    ])
    await workers.hook('finalize/truncate1')
    const res = await ax.get('/api/v1/datasets/truncate1/lines', { params: { truncate: '4', sort: '_i' } })
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].str, 'bla')
    assert.equal(res.data.results[1].str, 'blab...')
  })

  const wildCarditems = {
    t1: 'prefix',
    t2: 'prefixsuite',
    t3: 'configurations Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt configurations ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit configurer anim id est laborum.',
    p1: 'phrase 1 mot1 mot2 mot3 mot4',
    p2: 'phrase 2 mot1 mot3 mot2 mot4',
    t4: 'prefixSUITE'
  }

  it('Search in dataset using a contains query on a wildcard field', async function () {
    // Load a few lines
    const ax = dmeadus
    await ax.put('/api/v1/datasets/wildcards', {
      isRest: true,
      title: 'wildcards',
      schema: [{ key: 'content', type: 'string', 'x-capabilities': { wildcard: true } }]
    })
    let res = await ax.post('/api/v1/datasets/wildcards/_bulk_lines', Object.keys(wildCarditems).map(key => ({ _id: key, content: wildCarditems[key] })))
    await workers.hook('finalize/wildcards')

    // query with a trailing wildcard works well on the main keyword field
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:prefix' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:prefix*' } })
    assert.equal(res.data.total, 3)

    // leading wildcard filter is rejected by default on the main keyword field
    // await assert.rejects(ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:*suite' } }), (err: any) => err.status === 400)
    // await assert.rejects(ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content:(prefix OR *suite)' } }), (err: any) => err.status === 400)
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:*SUITE' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't4')
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { content_contains: 'suite' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't2')
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:*suite' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't2')
    res = await ax.get('/api/v1/datasets/wildcards/lines', { params: { qs: 'content.wildcard:(prefix OR *suite)' } })
    assert.equal(res.data.total, 2)
  })

  it('Wildcards can be activated after first indexation', async function () {
    // Load a few lines
    const ax = dmeadus
    await ax.put('/api/v1/datasets/wildcards2', {
      isRest: true,
      title: 'wildcards2',
      schema: [{ key: 'content', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/wildcards2/_bulk_lines', Object.keys(wildCarditems).map(key => ({ _id: key, content: wildCarditems[key] })))
    await workers.hook('finalize/wildcards2')

    // leading wildcard filter is rejected by default
    await assert.rejects(ax.get('/api/v1/datasets/wildcards2/lines', { params: { qs: 'content.wildcard:*suite' } }), (err: any) => err.status === 400)

    await ax.patch('/api/v1/datasets/wildcards2', { schema: [{ key: 'content', type: 'string', 'x-capabilities': { wildcard: true } }] })
    await workers.hook('finalize/wildcards2')
    const res = await ax.get('/api/v1/datasets/wildcards2/lines', { params: { qs: 'content.wildcard:*suite' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't2')
  })

  it('Search in dataset using all supported query modes', async function () {
    // Load a few lines
    const ax = dmeadus
    let dataset = (await ax.put('/api/v1/datasets/qmodes', {
      isRest: true,
      title: 'qmodes',
      schema: [{ key: 'content', type: 'string' }]
    })).data
    const items = {
      t1: 'prefix',
      t2: 'prefixsuite',
      t3: 'configurations Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt configurations ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit configurer anim id est laborum.',
      p1: 'phrase 1 mot1 mot2 mot3 mot4',
      p2: 'phrase 2 mot1 mot3 mot2 mot4'
    }
    let res = await ax.post('/api/v1/datasets/qmodes/_bulk_lines', Object.keys(items).map(key => ({ _id: key, content: items[key] })))
    dataset = await workers.hook('finalize/qmodes')
    assert.ok(dataset.schema.find(f => f.key === '_id'))
    assert.ok(dataset.schema.find(f => f.key === '_updatedAt'))
    res = await ax.get('/api/v1/datasets/qmodes/lines')
    assert.equal(res.data.total, Object.keys(items).length)

    // simple mode searches for a full word
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'prefix', q_mode: 'simple' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 't1')

    // complete searches for start of word as well as full word
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'prefix', q_mode: 'complete' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._score > res.data.results[1]._score)
    assert.equal(res.data.results[0]._id, 't1')
    assert.equal(res.data.results[1]._id, 't2')

    // complete searches for start of word is not broken by stemming
    for (let i = 3; i < 'configuration'.length; i++) {
      res = await ax.get('/api/v1/datasets/qmodes/lines', {
        params: {
          q: 'configuration'.substring(0, i + 1),
          q_mode: 'complete',
          highlight: 'content'
        }
      })
      assert.ok(res.data.results[0]._highlight.content[0].includes('"highlighted"'))
      assert.equal(res.data.total, 1)
    }

    // simple searches for separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'simple' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._score, res.data.results[1]._score)
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: '"mot1 mot2"', q_mode: 'simple' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]._id, 'p1')

    // complete searches for phrases as well as separate words
    res = await ax.get('/api/v1/datasets/qmodes/lines', { params: { q: 'mot1 mot2', q_mode: 'complete' } })
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results[0]._score > res.data.results[1]._score)
  })

  it('Use the full power of ES query string syntax', async function () {
    // Load a few lines
    const ax = dmeadus
    await ax.put('/api/v1/datasets/qsfilters', {
      isRest: true,
      title: 'qmodes',
      schema: [
        { key: 'str1', type: 'string' },
        { key: 'str2', type: 'string' },
        { key: 'int1', type: 'integer' },
        { key: 'nb1', type: 'number' }
      ]
    })
    const items = [
      { _id: 'line1', str1: 'test 1' },
      { _id: 'line2', str1: 'test 2' },
      { _id: 'line3', str1: 'special " char' },
      { _id: 'line4', str1: 'special , char' }
    ]
    let res = await ax.post('/api/v1/datasets/qsfilters/_bulk_lines', items)
    await workers.hook('finalize/qsfilters')

    res = await ax.get('/api/v1/datasets/qsfilters/lines')
    assert.equal(res.data.total, items.length)

    // full text all lines matching at least one token is returned
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'test 1' } })
    assert.equal(res.data.total, 2)

    // full text all lines matching all tokens are returned
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: '"test 1"' } })
    assert.equal(res.data.total, 1)

    // strict equality attribute matching
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test 1"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"test"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"Test 1"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str2:"test 1"' } })
    assert.equal(res.data.total, 0)
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'unknownstr:"test 1"' } }), (err: any) => err.status === 400)

    // strict equality with escaped special chars
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\" char"' } })
    assert.equal(res.data.total, 1)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special char"' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special \\, char"' } })
    assert.equal(res.data.total, 1)

    // wrong syntax, return a useful error
    await assert.rejects(ax.get('/api/v1/datasets/qsfilters/lines', { params: { qs: 'str1:"special " char "' } }), (err: any) => err.status === 400)

    // TODO: add examples using multi-fields indexing, lowercase, etc ?
  })

  it('get deeper into data', async function () {
    const ax = dmeadus

    const schema = [{ key: 'attr1', type: 'integer' }, { key: 'attr2', type: 'integer' }]

    const actions = []
    for (let i = 0; i < 100; i++) {
      actions.push({ _action: 'create', attr1: i, attr2: 99 - i })
    }

    for (let i = 0; i < 3; i++) {
      await ax.put('/api/v1/datasets/rest-page' + i, {
        isRest: true,
        title: 'rest pagination ' + i,
        schema
      })

      const res = await ax.post(`/api/v1/datasets/rest-page${i}/_bulk_lines`, actions)
      await workers.hook('finalize/rest-page' + i)
      assert.equal(res.data.nbOk, 100)
      assert.equal(res.data.nbCreated, 100)
    }

    await ax.put('/api/v1/datasets/virtual-page', {
      isVirtual: true,
      virtual: { children: ['rest-page0', 'rest-page1', 'rest-page2'] },
      schema,
      title: 'a virtual dataset'
    })
    await workers.hook('finalize/virtual-page')

    let res = await ax.get('/api/v1/datasets/rest-page0/lines')
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 99)
    assert.equal(res.data.results[0].attr2, 0)
    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 12)
    assert.equal(res.data.results[0].attr1, 87)
    assert.equal(res.data.results[0].attr2, 12)

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 20, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 0)
    assert.ok(res.data.next)
    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 20)
    assert.equal(res.data.results[0].attr1, 20)

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)

    res = await ax.get('/api/v1/datasets/rest-page0/lines', { params: { page: 2, size: 10, sort: 'attr1' } })
    assert.equal(res.data.total, 100)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 10)
    assert.equal(res.data.results[0].attr2, 89)

    res = await ax.get('/api/v1/datasets/virtual-page/lines?size=10&sort=attr1')
    assert.equal(res.data.total, 300)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 0)
    assert.equal(res.data.results[1].attr1, 0)
    assert.equal(res.data.results[2].attr1, 0)
    assert.equal(res.data.results[9].attr1, 3)

    assert.ok(res.data.next)
    assert.equal(res.headers.link, `<${res.data.next}>; rel=next`)
    const after = JSON.parse('[' + new URL(res.data.next).searchParams.get('after') + ']')
    assert.equal(after.length, 3)
    assert.equal(after[0], res.data.results[9].attr1)
    assert.equal(after[1], res.data.results[9]._i)
    assert.equal(after[2], res.data.results[9]._rand)

    res = await ax.get(res.data.next)
    assert.equal(res.data.total, 300)
    assert.equal(res.data.results.length, 10)
    assert.equal(res.data.results[0].attr1, 3)
    assert.equal(res.data.results[1].attr1, 3)
    assert.equal(res.data.results[2].attr1, 4)
  })

  it('Date match special filter on date field with date-time format', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [{ key: 'date1', type: 'string', format: 'date-time', 'x-refersTo': 'http://schema.org/Date' }]
    })
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { date1: '2023-11-19T23:00:00.000Z' }, // start of 20/11/2023 in our timezone
      { date1: '2023-11-20T23:00:00.000Z' }, // start of 21/11/2023 in our timezone
      { date1: '2023-11-21T23:00:00.000Z' }, // start of 22/11/2023 in our timezone
      { date1: '2023-11-22T08:00:00.000Z' }, // morning of 22/11/2023
      { date1: '2023-11-23T08:00:00.000Z' } // morning of 23/11/2023
    ])
    await workers.hook('finalize/rest-date-match')

    // filter on a simple date
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z'])

    // filter on a date interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-21,2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    // _gte and _lte filter provide same result
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gte: '2023-11-21', date1_lte: '2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', date1_gt: '2023-11-20', date1_lt: '2023-11-22' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z']) // start of 21, betwen the 20 and 22 in our timezone

    // filter on a largerdate interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-10,2023-11-28' } })
    assert.equal(res.data.results.length, 5)

    // filter on a date-time interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'date1', _c_date_match: '2023-11-20T23:00:00.000Z,2023-11-22T08:00:00.000Z' } })
    assert.deepEqual(res.data.results.map(result => result.date1), ['2023-11-20T23:00:00.000Z', '2023-11-21T23:00:00.000Z', '2023-11-22T08:00:00.000Z'])
  })

  it('Date match special filter on startDate and endDate fields with date-time format', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest-date-match', {
      isRest: true,
      title: 'rest-date-match',
      schema: [
        { key: 'start', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/startDate' },
        { key: 'end', type: 'string', format: 'date-time', 'x-refersTo': 'https://schema.org/endDate' }
      ]
    })
    res = await ax.post('/api/v1/datasets/rest-date-match/_bulk_lines', [
      { start: '2023-11-19T23:00:00.000Z', end: '2023-11-20T22:59:00.000Z' }, // whole day of 20/11/2023 in our timezone
      { start: '2023-11-20T23:00:00.000Z', end: '2023-11-21T22:59:00.000Z' }, // whole day of 21/11/2023 in our timezone
      { start: '2023-11-18T23:00:00.000Z', end: '2023-11-28T23:00:00.000Z' }, // a larger encompassing interval
      { start: '2023-11-05T23:00:00.000Z', end: '2023-11-07T23:00:00.000Z' } // a separate interval
    ])
    await workers.hook('finalize/rest-date-match')

    // filter on a simple date inside an interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])

    // filter on a date interval
    res = await ax.get('/api/v1/datasets/rest-date-match/lines', { params: { sort: 'start', _c_date_match: '2023-11-20,2023-11-21' } })
    assert.deepEqual(res.data.results.map(result => result.start), ['2023-11-18T23:00:00.000Z', '2023-11-19T23:00:00.000Z', '2023-11-20T23:00:00.000Z'])
  })
})
