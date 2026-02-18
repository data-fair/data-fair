import { stringify as csvStrStream } from 'csv-stringify'
import { stringify as csvStrSync } from 'csv-stringify/sync'
import { Transform } from 'stream'
import path from 'path'
import { Piscina } from 'piscina'

export const results2sheetPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../../datasets/threads/results2sheet.js'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

export const geojson2shpPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../../datasets/threads/geojson2shp.ts'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

export const csvStringifyOptions = (dataset, query = {}, useTitle = false) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  return {
    bom: true,
    columns: properties.map(field => ({ key: field.key, header: (useTitle ? field.title : field['x-originalName']) || field['x-originalName'] || field.key })),
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

export const results2csv = async (req, results) => {
  let csv = ''

  const options = csvStringifyOptions(req.dataset, req.query)

  if (results.length < sliceSize) {
    // escape special null char (see test-it/resources/csv-cases/rge-null-chars.csv)
    csv += csvStrSync(results, options).replace(/\0/g, '')
  } else {
    let i = 0
    while (i < results.length) {
      // escape special null char (see test-it/resources/csv-cases/rge-null-chars.csv)
      const sliceOptions = i === 0 ? options : { ...options, header: false, bom: false }
      csv += csvStrSync(results.slice(i, i + sliceSize), sliceOptions).replace(/\0/g, '')
      i += sliceSize
      // avoid blocking the event loop
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  return csv
}

export const csvStreams = (dataset, query = {}, useTitle = false) => {
  return [
    csvStrStream(csvStringifyOptions(dataset, query, useTitle)),
    new Transform({
      transform (item, encoding, callback) {
        // escape special null char (see test-it/resources/csv-cases/rge-null-chars.csv)
        callback(null, item.toString().replace(/\0/g, ''))
      }
    })
  ]
}

export const results2sheet = async (req, results, bookType) => {
  const buf = Buffer.from(await results2sheetPiscina.run({
    results,
    bookType,
    query: req.query,
    dataset: req.dataset.__isProxy ? req.dataset.__proxyTarget : req.dataset,
    downloadUrl: req.publicBaseUrl + req.originalUrl,
    labels: req.__('sheets')
  }))
  return buf
}

export const geojson2shp = async (geojson, baseName) => {
  return geojson2shpPiscina.run({ geojson: JSON.stringify(geojson), baseName })
}
