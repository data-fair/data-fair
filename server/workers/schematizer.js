// schematize dataset data and try to guess the schém
const journals = require('../journals')

const schematizeDataset = async function(db) {
  let dataset = await db.collection('datasets').find({
    status: 'analyzed',
    'file.mimetype': 'text/csv'
  }).sort({
    updatedAt: -1
  }).toArray()
  dataset = dataset.pop()
  if (!dataset) return
  await journals.log(db, dataset, {
    type: 'schematize-start'
  })
  const schema = dataset.schema || {}
  Object.assign(schema, ...Object.keys(dataset.file.schema).filter(field => !schema[field] || !schema[field].auto).map(field => ({
    [field]: Object.assign(dataset.file.schema[field], {
      auto: true
    })
  })))
  await db.collection('datasets').updateOne({
    id: dataset.id
  }, {
    $set: {
      status: 'schematized',
      schema
    }
  })
  await journals.log(db, dataset, {
    type: 'schematize-end'
  })
}

module.exports = async function loop(db) {
  await schematizeDataset(db)
  setTimeout(() => loop(db), 1000)
}
