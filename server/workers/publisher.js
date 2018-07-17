// Index tabular datasets with elasticsearch using available information on dataset schema
const shortid = require('shortid')
const journals = require('../utils/journals')
const catalogs = require('../catalogs')
exports.filter = {status: 'finalized', 'publications.status': 'waiting'}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const datasetsCollection = db.collection('datasets')
  const catalogsCollection = db.collection('catalogs')

  dataset.publications.filter(p => !p.id).forEach(p => {
    p.id = shortid.generate()
  })
  await datasetsCollection.updateOne({id: dataset.id}, {$set: {publications: dataset.publications}})

  const waitingPublication = dataset.publications.find(p => p.status === 'waiting')

  async function setResult(error) {
    let patch = {}
    if (error) {
      waitingPublication.status = patch['publications.$.status'] = 'error'
      waitingPublication.error = patch['publications.$.error'] = error
    } else {
      waitingPublication.status = patch['publications.$.status'] = 'published'
      patch['publications.$.result'] = waitingPublication.result
      patch['publications.$.targetUrl'] = waitingPublication.targetUrl
    }
    await datasetsCollection.updateOne(
      {id: dataset.id, 'publications.id': waitingPublication.id},
      {$set: patch}
    )
  }

  const catalog = await catalogsCollection.findOne({id: waitingPublication.catalog})

  if (!catalog) {
    await journals.log(app, dataset, {type: 'error', data: `Une publication fait référence à un catalogue inexistant (${waitingPublication.id})`})
    await setResult('Catalogue inexistant')
  }

  try {
    const res = await catalogs.publishDataset(catalog, dataset, waitingPublication)
    await journals.log(app, dataset, {type: 'publication', data: `Publication OK vers ${catalog.title || catalog.url}`})
    await setResult(null, res)
  } catch (err) {
    await journals.log(app, dataset, {type: 'error', data: err.message || err})
    await setResult(err.message || err)
  }
}
