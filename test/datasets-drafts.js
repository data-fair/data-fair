const assert = require('assert').strict
const fs = require('fs')
const nock = require('nock')
const FormData = require('form-data')
const config = require('config')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')
const esUtils = require('../server/utils/es')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

describe('datasets in draft mode', () => {
  it('create new dataset in draft mode and validate it', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    // Dataset received and parsed
    let dataset = await workers.hook('csvAnalyzer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.file, undefined)
    assert.equal(dataset.draft.draftReason.key, 'file-new')
    assert.ok(dataset.draft.originalFile)
    assert.ok(dataset.draft.file)
    assert.equal(dataset.draft.status, 'analyzed')
    assert.equal(dataset.schema.length, 0)
    assert.equal(dataset.draft.schema.length, 4)

    // ES indexation and finalization
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.equal(dataset.draft.count, 2)

    // querying with ?draft=true automatically merges the draft state into the main state
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.draft, undefined)
    assert.equal(dataset.draftReason.key, 'file-new')
    const esAlias = esUtils.aliasName(dataset)
    assert.ok(esAlias.startsWith('dataset-test_draft-'))

    // Update schema to specify geo point
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema }, { params: { draft: true } })).data
    assert.equal(dataset.status, 'analyzed')
    assert.equal(dataset.draftReason.key, 'file-new')
    const patchedLocProp = dataset.schema.find(p => p.key === 'loc')
    assert.equal(patchedLocProp['x-refersTo'], 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')

    // Second ES indexation
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'finalized')
    assert.ok(dataset.draft.bbox)

    // reuploading in draft mode is not permitted
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/bad-format.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset.csv')
    try {
      await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 409)
    }

    // querying for lines is not yet possible
    try {
      await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 409)
    }
    // except in draft mode
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.count, 2)
    assert.ok(dataset.bbox)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 2)

    // the journal kept traces of all changes (draft and not)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    journal.reverse()
    assert.equal(journal[0].type, 'dataset-created')
    assert.equal(journal[1].type, 'analyze-start')
    assert.equal(journal[1].draft, true)
    assert.equal(journal[2].type, 'analyze-end')
    assert.equal(journal[2].draft, true)
    assert.equal(journal[3].type, 'index-start')
    assert.equal(journal[3].draft, true)
    assert.equal(journal[4].type, 'index-end')
    assert.equal(journal[4].draft, true)
    assert.equal(journal[5].type, 'finalize-start')
    assert.equal(journal[5].draft, true)
    assert.equal(journal[6].type, 'finalize-end')
    assert.equal(journal[6].draft, true)
    assert.equal(journal[7].type, 'index-start')
    assert.equal(journal[7].draft, true)
    assert.equal(journal[8].type, 'index-end')
    assert.equal(journal[8].draft, true)
    assert.equal(journal[9].type, 'finalize-start')
    assert.equal(journal[9].draft, true)
    assert.equal(journal[10].type, 'finalize-end')
    assert.equal(journal[10].draft, true)
    assert.equal(journal[11].type, 'draft-validated')
    assert.equal(journal[12].type, 'index-start')
    assert.equal(journal[12].draft, undefined)
    assert.equal(journal[13].type, 'index-end')
    assert.equal(journal[13].draft, undefined)
    assert.equal(journal[14].type, 'finalize-start')
    assert.equal(journal[14].draft, undefined)
    assert.equal(journal[15].type, 'finalize-end')
    assert.equal(journal[15].draft, undefined)
  })

  it('create a draft when updating the data file', async () => {
    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    assert.equal(dataset.draftReason.key, 'file-updated')
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.file.name, 'dataset1.csv')
    assert.equal(dataset.count, 2)
    assert.equal(dataset.draft.file.name, 'dataset2.csv')
    assert.equal(dataset.draft.count, 5)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 5)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    assert.ok(res.data.startsWith('id,adr,some date,loc'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/raw`, { params: { draft: true } })
    assert.ok(res.data.startsWith('id,adr,somedate,employees'))

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.name, 'dataset2.csv')
    assert.ok(dataset.updatedAt > dataset.createdAt)
    assert.equal(dataset.dataUpdatedAt, dataset.updatedAt)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 5)

    // the journal kept traces of all changes (draft and not)
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    journal.reverse()
    assert.equal(journal[0].type, 'dataset-created')
    assert.equal(journal[1].type, 'analyze-start')
    assert.equal(journal[2].type, 'analyze-end')
    assert.equal(journal[3].type, 'index-start')
    assert.equal(journal[4].type, 'index-end')
    assert.equal(journal[5].type, 'finalize-start')
    assert.equal(journal[6].type, 'finalize-end')
    assert.equal(journal[7].type, 'data-updated')
    assert.equal(journal[7].draft, true)
    assert.equal(journal[8].type, 'analyze-start')
    assert.equal(journal[8].draft, true)
    assert.equal(journal[9].type, 'analyze-end')
    assert.equal(journal[9].draft, true)
    assert.equal(journal[10].type, 'index-start')
    assert.equal(journal[10].draft, true)
    assert.equal(journal[11].type, 'index-end')
    assert.equal(journal[11].draft, true)
    assert.equal(journal[12].type, 'finalize-start')
    assert.equal(journal[12].draft, true)
    assert.equal(journal[13].type, 'finalize-end')
    assert.equal(journal[13].draft, true)
    assert.equal(journal[14].type, 'draft-validated')
    assert.equal(journal[15].type, 'index-start')
    assert.equal(journal[15].draft, undefined)
    assert.equal(journal[16].type, 'index-end')
    assert.equal(journal[16].draft, undefined)
    assert.equal(journal[17].type, 'finalize-start')
    assert.equal(journal[17].draft, undefined)
    assert.equal(journal[18].type, 'finalize-end')
    assert.equal(journal[18].draft, undefined)

    // the notifications contain the same thing as the journal minus not very interesting events
    // and adding some extra events were triggerred when validating the draft
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-dataset-created:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-finalize-end:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-draft-data-updated:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-downloaded:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-data-updated:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-finalize-end:dataset1')
  })

  it('create a draft, update with breaking changes and receive warning', async () => {
    // listen to all notifications
    const notifications = []
    global.events.on('notification', (n) => notifications.push(n))

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    let dataset = await workers.hook('finalizer')

    // upload a new file
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset-number.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset-number.csv')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })
    dataset = await workers.hook('finalizer')

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.status, 'finalized')

    // the notifications contain the same thing as the journal minus not very interesting events
    // and adding some extra events were triggerred when validating the draft
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-dataset-created:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-finalize-end:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-draft-data-updated:dataset1')
    assert.equal(notifications.shift().topic.key, 'data-fair:dataset-data-updated:dataset1')
    const breaking1 = notifications.shift()
    assert.equal(breaking1.topic.key, 'data-fair:dataset-breaking-change:dataset1')
    console.log(breaking1)
  })

  it('create a draft of a large file and index a sample', async () => {
    let content = 'col'
    for (let i = 0; i < 2000; i++) {
      content += '\nval' + i
    }
    const form = new FormData()
    form.append('file', content, 'dataset.csv')
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalizer')
    assert.equal(dataset.draft.count, 100)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 100)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook('finalizer')
    assert.equal(dataset.count, 2000)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2000)
  })

  it('Create a draft with attachments', async () => {
    const ax = global.ax.dmeadus

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization of draft
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.status, 'draft')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test', draft: true } })
    assert.equal(res.data.total, 2)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'test' } })
    assert.equal(res.data.total, 2)
  })

  it('Create a draft of a geo file that requires conversion', async () => {
    if (config.ogr2ogr.skip) {
      return console.log('Skip ogr2ogr test in this environment')
    }

    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/geo/stations.zip')
    const form = new FormData()
    form.append('file', datasetFd, 'stations.zip')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)

    // dataset converted
    let dataset = await workers.hook('converter')
    assert.equal(dataset.status, 'draft')
    assert.equal(dataset.draft.status, 'loaded')
    assert.equal(dataset.draft.file.name, 'stations.geojson')

    dataset = await workers.hook('finalizer')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { draft: true } })
    assert.equal(res.data.total, 86)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 86)
  })

  it('Manage error status in draft mode', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,unknown address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.draft.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension failure with HTTP error code
    nock('http://test.com').post('/geocoder/coords').reply(500, 'some error')
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    try {
      await workers.hook('extender')
      assert.fail()
    } catch (err) {
      assert.equal(err.message, '500 - some error')
    }

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`, { params: { draft: true } })).data
    assert.equal(dataset.status, 'error')
  })

  it('Remove extensions when draft file is missing the input properties', async () => {
    const ax = global.ax.dmeadus

    // Initial dataset with addresses
    const form = new FormData()
    const content = `label,adr
koumoul,19 rue de la voie lactée saint avé
other,address
`
    form.append('file', content, 'dataset2.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form), params: { draft: true } })
    assert.equal(res.status, 201)
    let dataset = await workers.hook(`finalizer/${res.data.id}`)
    dataset.draft.schema.find(field => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    // Prepare for extension
    nock('http://test.com').post('/geocoder/coords').reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 2)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
        .map(JSON.stringify).join('\n') + '\n'
    })
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.draft.schema,
      extensions: [{ active: true, remoteService: 'geocoder-koumoul', action: 'postCoords' }],
    }, { params: { draft: true } })
    assert.equal(res.status, 200)
    await workers.hook(`finalizer/${dataset.id}`)

    // validate the draft
    await ax.post(`/api/v1/datasets/${dataset.id}/draft`)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.schema.length, 13)

    // load a file missing the address property

    const form2 = new FormData()
    const content2 = `label
koumoul
other
`
    form2.append('file', content2, 'dataset2-noadr.csv')
    res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2), params: { draft: true } })
    assert.equal(res.status, 200)
    dataset = await workers.hook(`finalizer/${dataset.id}`)
    assert.equal(dataset.extensions.length, 1)
    assert.equal(dataset.schema.length, 13)
    assert.equal(dataset.draft.extensions.length, 0)
    assert.equal(dataset.draft.schema.length, 4)
  })
})
