const csvStringify = require('csv-stringify')
const { Transform } = require('stream')

exports.result2csv = (dataset, query, results) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))

  return [
    new Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        callback(null, properties.map(field => item[field.key]))
      },
    }),
    // quoted_string to prevent bugs with strings containing \r or other edge cases
    csvStringify({ columns: properties.map(field => field['x-originalName'] || field.key), header: true, quoted_string: true }),
  ]
}
