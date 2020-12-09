const csvStringify = require('csv-stringify')
const { Transform } = require('stream')
const XLSX = require('xlsx')

exports.result2csv = (dataset, query) => {
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

exports.results2sheet = (dataset, query, results, bookType) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  const header = properties.map(field => field['x-originalName'] || field.key)
  const dateProperties = properties.filter(p => p.format === 'date' || p.format === 'date-time')

  const lines = results.map(result => {
    const line = {}
    properties.forEach(prop => {
      line[prop['x-originalName'] || prop.key] = result[prop.key]
    })
    dateProperties.forEach(dateProp => {
      if (result[dateProp.key]) line[dateProp['x-originalName'] || dateProp.key] = new Date(result[dateProp.key])
    })
    return line
  })

  const sheet = XLSX.utils.json_to_sheet(lines, { header, cellDates: true })
  const workbook = XLSX.utils.book_new()
  workbook.Props = {}
  workbook.Props.Title = dataset.title
  XLSX.utils.book_append_sheet(workbook, sheet, dataset.id)
  const result = XLSX.write(workbook, { type: 'buffer', cellDates: true, bookType, compression: true })
  return result
}
