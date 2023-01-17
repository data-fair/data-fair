const csvStringify = require('csv-stringify')
const { Transform } = require('stream')
const XLSX = require('xlsx')

// cf https://stackoverflow.com/a/57673262
const val2string = (val) => {
  val = val ?? ''
  return typeof val.toLocaleString === 'function' ? val.toLocaleString() : val + ''
}
function fitToColumn (arrayOfArray) {
  // get maximum character of each column
  return arrayOfArray[0].map((a, i) => ({ wch: Math.min(100, Math.max(...arrayOfArray.map(a2 => val2string(a2[i]).length))) }))
}

exports.result2csv = (dataset, query = {}) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))

  return [
    new Transform({
      objectMode: true,
      transform (item, encoding, callback) {
        callback(null, properties.map(field => item[field.key]))
      }
    }),
    // quoted_string to prevent bugs with strings containing \r or other edge cases
    csvStringify({
      columns: properties.map(field => field['x-originalName'] || field.key),
      header: query.header !== 'false',
      quoted_string: true,
      cast: {
        boolean: (value) => {
          if (value) return '1'
          if (value === false) return '0'
          return ''
        }
      }
    }),
    new Transform({
      transform (item, encoding, callback) {
        // escape special null char (see test/resources/csv-cases/rge-null-chars.csv)
        callback(null, item.toString().replace(/\0/g, ''))
      }
    })
  ]
}

exports.results2sheet = (req, results, bookType) => {
  const { query, dataset, __ } = req
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  const dateProperties = properties
    .filter(p => p.format === 'date' || p.format === 'date-time')
    .map(prop => prop.key)

  const workbook = XLSX.utils.book_new()
  workbook.Props = {}
  workbook.Props.Title = dataset.title

  // data sheet
  const dataArray = [properties.map(prop => prop['x-originalName'] || prop.key)]
  for (const result of results) {
    dataArray.push(properties.map(prop => {
      let value = result[prop.key]
      if (value && dateProperties.includes(prop.key)) value = new Date(value)
      return value
    }))
  }
  const dataSheet = XLSX.utils.aoa_to_sheet(dataArray, { cellDates: true })
  dataSheet['!cols'] = fitToColumn(dataArray)
  XLSX.utils.book_append_sheet(workbook, dataSheet, __('sheets.data'))

  // metadata sheet
  const metadataArray = [
    [__('sheets.id'), dataset.id],
    [__('sheets.title'), dataset.title],
    [__('sheets.owner'), dataset.owner.name],
    [__('sheets.dataUpdatedAt'), dataset.dataUpdatedAt],
    [__('sheets.count'), dataset.count + '']
  ]
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataArray, { cellDates: true })
  metadataSheet['!cols'] = fitToColumn(metadataArray)
  XLSX.utils.book_append_sheet(workbook, metadataSheet, __('sheets.dataset'))

  // query sheet
  const url = new URL(req.publicBaseUrl + req.originalUrl)
  url.searchParams.delete('finalizedAt')
  const queryArray = [
    [__('sheets.url'), url.href],
    [__('sheets.select'), query.select || '*'],
    [__('sheets.sort'), query.sort],
    [__('sheets.q'), query.q],
    [__('sheets.qs'), query.qs]
  ]
  const querySheet = XLSX.utils.aoa_to_sheet(queryArray, { cellDates: true })
  querySheet['!cols'] = fitToColumn(queryArray)
  XLSX.utils.book_append_sheet(workbook, querySheet, __('sheets.query'))

  const result = XLSX.write(workbook, { type: 'buffer', cellDates: true, bookType, compression: true })
  return result
}
