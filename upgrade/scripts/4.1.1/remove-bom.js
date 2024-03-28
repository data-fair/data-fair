exports.description = 'Some datasets were improperly analyzed and contain a BOM in x-originalName.'

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
const hasBOM = function (buffer) {
  if (typeof buffer === 'string') buffer = Buffer.from(buffer)
  return buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
}

const removeBOM = function (str) {
  let buffer = Buffer.from(str)
  // multiple strip BOM because of badly formatted files from some clients
  while (hasBOM(buffer)) {
    buffer = buffer.slice(3)
  }
  return buffer.toString()
}

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ file: { $exists: 1 } }).project({ id: 1, slug: 1, schema: 1, file: 1 })) {
    let hasChanged = false
    for (const schema of [dataset.schema, dataset.file.schema]) {
      if (!schema) continue
      for (const field of schema) {
        if (field['x-originalName'] && hasBOM(field['x-originalName'])) {
          debug(`remove BOM from field ${dataset.id} (${dataset.slug}) / ${field['x-originalName']}`)
          field['x-originalName'] = removeBOM(field['x-originalName'])
          hasChanged = true
        }
      }
    }
    if (hasChanged) {
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { schema: dataset.schema, file: dataset.file } })
    }
  }
}
