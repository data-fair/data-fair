// convert from tabular data to csv or geographical data to geojson
const path = require('path')
const fs = require('fs')
const config = require('config')
const XLSX = require('xlsx')

exports.type = 'dataset'
exports.eventsPrefix = 'convert'
exports.filter = {status: 'uploaded'}

const tabularTypes = exports.tabularTypes = new Set([
  'application/vnd.oasis.opendocument.spreadsheet', // ods, fods
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/dbase', // dbf
  'text/plain', // txt, dif
  'text/tab-separated-values' // tsv
])
const geographicalTypes = exports.geographicalTypes = new Set([])

const writeFile = (path, data, opts = 'utf8') =>
  new Promise((resolve, reject) => {
    fs.writeFile(path, data, opts, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const originalFilePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.originalFile.name.split('.').pop())

  if (tabularTypes.has(dataset.originalFile.mimetype)) {
    const workbook = XLSX.readFile(originalFilePath)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_csv(worksheet)
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
    await writeFile(filePath, data)
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: data.length,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
  } else if (geographicalTypes.has(dataset.originalFile.mimetype)) {
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.geojson',
      // size: req.file.size,
      mimetype: 'application/geo+json',
      encoding: 'utf-8'
    }
  } else {
    // TODO: throw error
  }

  dataset.status = 'loaded'

  await db.collection('datasets').updateOne({id: dataset.id}, {
    $set: {status: 'loaded', file: dataset.file}
  })
}
