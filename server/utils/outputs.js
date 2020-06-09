const csvStringify = require('csv-stringify')

exports.result2csv = (dataset, query, results) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  // quoted_string to prevent bugs with strings containing \r or other edge cases
  return csvStringify({ columns: properties.map(field => field.title || field['x-originalName'] || field.key), header: true, quoted_string: true })
}
