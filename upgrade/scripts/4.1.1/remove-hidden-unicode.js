exports.description = 'Some datasets were improperly analyzed and contain a BOM in x-originalName. Also remove other hidden chars.'

const outOfCharacter = require('out-of-character')

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ file: { $exists: 1 } }).project({ id: 1, slug: 1, schema: 1, file: 1 })) {
    debug('check dataset', dataset.id, dataset.slug)
    let hasChanged = false
    for (const schema of [dataset.schema, dataset.file?.schema]) {
      if (!schema) continue
      for (const field of schema) {
        if (field['x-originalName']) {
          const stripped = outOfCharacter.replace(field['x-originalName'])
          if (stripped !== field['x-originalName']) {
            debug(`remove hidden chars from field ${dataset.id} (${dataset.slug}) / ${field['x-originalName']}`)
            field['x-originalName'] = stripped
            hasChanged = true
          }
        }
      }
    }
    if (hasChanged) {
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { schema: dataset.schema, file: dataset.file } })
    }
  }
}
