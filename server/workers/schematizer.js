// schematize dataset data and try to guess the schém
const journals = require('../journals')

// A hook/spy for testing purposes
let resolveHook, rejectHook
exports.hook = function() {
  return new Promise((resolve, reject) => {
    resolveHook = resolve
    rejectHook = reject
  })
}

exports.loop = async function loop(db) {
  try {
    const dataset = await schematizeDataset(db)
    if (dataset && resolveHook) resolveHook(dataset)
  } catch (err) {
    console.error(err)
    if (rejectHook) rejectHook(err)
  }

  setTimeout(() => loop(db), 1000)
}

const schematizeDataset = async function(db) {
  let dataset = await db.collection('datasets').find({
    status: 'analyzed',
    'file.mimetype': 'text/csv'
  }).limit(1).sort({updatedAt: -1}).toArray()
  dataset = dataset.pop()
  if (!dataset) return

  await journals.log(db, dataset, {type: 'schematize-start'})

  const schema = dataset.schema = dataset.schema || {}
  Object.assign(schema, ...Object.keys(dataset.file.schema).filter(field => !schema[field] || !schema[field].auto).map(field => ({
    [field]: Object.assign(dataset.file.schema[field], {
      auto: true
    })
  })))

  dataset.status = 'schematized'
  await db.collection('datasets').updateOne({id: dataset.id}, {
    $set: {
      status: 'schematized',
      schema
    }
  })

  await journals.log(db, dataset, {type: 'schematize-end'})

  return dataset
}
