const csvStringify = require('csv-stringify')

exports.result2csv = (dataset, query, results) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  return csvStringify({ columns: properties.map(field => field.title || field['x-originalName'] || field.key), header: true })
}
