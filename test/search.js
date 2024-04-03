const assert = require('assert').strict
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

describe('search', () => {
  it('Get lines in dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    let res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    assert.equal(res.status, 200)
    await workers.hook(`finalizer/${dataset.id}`)
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
    // filter on exact values with query params suffixed with _eq
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_eq=koumoul`)
    assert.equal(res.data.total, 1)
    // fail to filter on unknown property
    assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines?BADFIELD_in=koumoul`), (err) => {
      assert.equal(err.status, 400)
      return true
    })
    // filter on ranges with query params suffixed with _lte, _gte, _lt, _gt
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?id_gt=cc`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?some_date_gt=2017-11-12`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?nb_gt=22`)
    assert.equal(res.data.total, 1)

    // filter on geo info
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?bbox=-2.5,40,3,47`)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?geo_distance=-2.75,47.7,10km`)
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
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=63,44,7&format=pbf&q=koumoul`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/x-protobuf')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?xyz=3,4,7&format=pbf`)
    assert.equal(res.status, 204)

    // CSV export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv`)
    let lines = res.data.split('\n')
    assert.equal(lines[0].trim(), '"id","adr","some date","loc","bool","nb"')
    assert.equal(lines[1], '"koumoul","19 rue de la voie lactée saint avé","2017-12-12","47.687375,-2.748526",0,11')
    locProp.title = 'Localisation'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook(`finalizer/${dataset.id}`)
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
    assert.ok(Number(res.headers['content-length']) > 5000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=ods`)
    console.log(res.headers)
    assert.equal(res.headers['content-disposition'], 'attachment; filename="dataset1.ods"')
    assert.ok(Number(res.headers['content-length']) > 5000)
  })

  it('search lines and collapse on field', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/collapsable.csv', ax)

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
    await workers.hook('finalizer')

    // TODO: this should be 400
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/lines?collapse=roles`), { status: 500 })
  })
})
