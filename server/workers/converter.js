// convert from tabular data to csv or geographical data to geojson
const path = require('path')
const fs = require('fs')
const config = require('config')
const XLSX = require('xlsx')
const ogr2ogr = require('ogr2ogr')
const util = require('util')
const writeFile = util.promisify(fs.writeFile)
const renameFile = util.promisify(fs.rename)
const statsFile = util.promisify(fs.stat)
const datasetUtils = require('../utils/dataset')
const decompress = require('decompress')

exports.type = 'dataset'
exports.eventsPrefix = 'convert'
exports.filter = { status: 'uploaded' }

const archiveTypes = exports.archiveTypes = new Set([
  'application/zip', // .zip
  'application/x-7z-compressed', // .7z
  'application/x-bzip', // .bzip
  'application/x-bzip2', // .bzip2
  'application/x-tar', // .tar
  'application/gzip' // .gz
])
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
  'application/gpx+xml' // gpx or xml ?
])

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
  const originalFilePath = datasetUtils.originalFileName(dataset)

  let isShapefile = false
  dataset.hasFiles = false
  if (archiveTypes.has(dataset.originalFile.mimetype)) {
    const dirName = datasetUtils.extractedFilesDirname(dataset)
    const files = (await decompress(originalFilePath, dirName)).map(f => f.path)
    const baseName = path.parse(dataset.originalFile.name).name
    // Check if this archive is actually a shapefile source
    if (files.find(f => f === baseName + '.shp') && files.find(f => f === baseName + '.shx') && files.find(f => f === baseName + '.dbf')) {
      isShapefile = true
    } else {
      const csvFilePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
      // Either there is a data.csv in this archive and we use it as the main source for data related to the files, or we create it
      if (files.find(f => f === 'data.csv')) {
        await renameFile(path.join(dirName, 'data.csv'), csvFilePath)
      } else {
        const csvContent = 'file\n' + files.map(f => `"${f}"`).join('\n') + '\n'
        await writeFile(csvFilePath, csvContent)
      }
      dataset.file = {
        name: path.parse(dataset.originalFile.name).name + '.csv',
        size: await statsFile(csvFilePath).size,
        mimetype: 'text/csv',
        encoding: 'utf-8'
      }
      dataset.hasFiles = true
    }
  }

  if (tabularTypes.has(dataset.originalFile.mimetype)) {
    const workbook = XLSX.readFile(originalFilePath)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_csv(worksheet)
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
    await writeFile(filePath, data)
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: await statsFile(filePath).size,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
  } else if (isShapefile || geographicalTypes.has(dataset.originalFile.mimetype)) {
    const geoJsonFile = ogr2ogr(originalFilePath)
      .format('GeoJSON')
      .options(['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326'])
      // .skipfailures()
      .stream()
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.geojson')
    await writeStream(filePath, geoJsonFile)
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.geojson',
      size: await statsFile(filePath).size,
      mimetype: 'application/geo+json',
      encoding: 'utf-8'
    }
  } else {
    // TODO: throw error
  }

  dataset.status = 'loaded'

  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: { status: 'loaded', file: dataset.file, hasFiles: dataset.hasFiles }
  })
}
