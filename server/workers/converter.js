// convert from tabular data to csv or geographical data to geojson
const path = require('path')
const fs = require('fs')
const config = require('config')
const XLSX = require('xlsx')
const ogr2ogr = require('ogr2ogr')
const util = require('util')

exports.type = 'dataset'
exports.eventsPrefix = 'convert'
exports.filter = { status: 'uploaded' }

const tabularTypes = exports.tabularTypes = new Set([
  'application/vnd.oasis.opendocument.spreadsheet', // ods, fods
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/dbase', // dbf
  'text/plain', // txt, dif
  'text/tab-separated-values' // tsv
])
const geographicalTypes = exports.geographicalTypes = new Set([
  'application/vnd.google-earth.kml+xml', // kml
  'application/vnd.google-earth.kmz', // kmz
  'application/gpx+xml', // gpx or xml ?
  'application/zip' // shp
])

const writeFile = util.promisify(fs.writeFile)
const writeStream = util.promisify((filePath, stream, callback) => {
  stream.on('error', (error) => {
    callback(error)
  })
  stream.on('end', () => {
    callback(null)
  })
  let writeError
  const ws = fs.createWriteStream(filePath)
    .on('end', () => {
      if (writeError) {
        return
      }
      callback(null)
    })
    .on('error', (error) => {
      writeError = true
      callback(error)
    })
  stream.pipe(ws)
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
    const geoJsonFile = ogr2ogr(originalFilePath)
      .format('GeoJSON')
      .options(['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326'])
      // .skipfailures()
      .stream()
    await writeStream(path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.geojson'), geoJsonFile)
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

  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: { status: 'loaded', file: dataset.file }
  })
}
