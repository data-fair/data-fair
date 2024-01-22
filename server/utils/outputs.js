const { stringify: csvStrStream } = require('csv-stringify')
const { stringify: csvStrSync } = require('csv-stringify/sync')
const { Transform } = require('stream')
const path = require('path')
const Piscina = require('piscina')

const results2sheetPiscina = new Piscina({
  filename: path.resolve(__dirname, '../threads/results2sheet.js'),
  maxThreads: 1
})

const csvStringifyOptions = (dataset, query = {}) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  return {
    columns: properties.map(field => ({ key: field.key, header: field['x-originalName'] || field.key })),
    header: query.header !== 'false',
    // quoted_string to prevent bugs with strings containing \r or other edge cases
    quoted_string: true,
    delimiter: query.sep || ',',
    cast: {
      boolean: (value) => {
        if (value) return '1'
        if (value === false) return '0'
        return ''
      }
    }
  }
}

const sliceSize = 200

exports.results2csv = async (req, results) => {
  // add BOM for excel, cf https://stackoverflow.com/a/17879474
  let csv = '\ufeff'

  const options = csvStringifyOptions(req.dataset, req.query)

  if (results.length < sliceSize) {
    // escape special null char (see test/resources/csv-cases/rge-null-chars.csv)
    csv += csvStrSync(results, options).replace(/\0/g, '')
  } else {
    let i = 0
    while (i < results.length) {
      // escape special null char (see test/resources/csv-cases/rge-null-chars.csv)
      const sliceOptions = i === 0 ? options : { ...options, header: false }
      csv += csvStrSync(results.slice(i, i + sliceSize), sliceOptions).replace(/\0/g, '')
      i += sliceSize
      // avoid blocking the event loop
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  return csv
}

exports.csvStreams = (dataset, query = {}) => {
  return [
    csvStrStream(csvStringifyOptions(dataset, query)),
    new Transform({
      transform (item, encoding, callback) {
        // escape special null char (see test/resources/csv-cases/rge-null-chars.csv)
        callback(null, item.toString().replace(/\0/g, ''))
      }
    })
  ]
}

exports.results2sheet = async (req, results, bookType) => {
  const buf = Buffer.from(await results2sheetPiscina.run({
    results,
    bookType,
    query: req.query,
    dataset: req.dataset,
    downloadUrl: req.publicBaseUrl + req.originalUrl,
    labels: req.__('sheets')
  }))
  return buf
}
