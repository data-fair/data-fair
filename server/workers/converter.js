// convert from tabular data to csv or geographical data to geojson
const path = require('path')
const fs = require('fs-extra')
const config = require('config')
const XLSX = require('xlsx')
const createError = require('http-errors')
const ogr2ogr = require('ogr2ogr')
const util = require('util')
const exec = require('child-process-promise').exec
const pump = util.promisify(require('pump'))
const csvStringify = require('csv-stringify')
const datasetUtils = require('../utils/dataset')
const icalendar = require('../utils/icalendar')
const vocabulary = require('../../contract/vocabulary')

exports.eventsPrefix = 'convert'

const archiveTypes = exports.archiveTypes = new Set([
  'application/zip' // .zip
  /* 'application/x-7z-compressed', // .7z
  'application/x-bzip', // .bzip
  'application/x-bzip2', // .bzip2
  'application/x-tar', // .tar
  'application/gzip' // .gz */
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
const calendarTypes = exports.calendarTypes = new Set(['text/calendar'])

async function decompress(mimetype, filePath, dirPath) {
  if (mimetype === 'application/zip') await exec(`unzip -o -q ${filePath} -d ${dirPath}`)
}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const originalFilePath = datasetUtils.originalFileName(dataset)

  let isShapefile = false
  if (archiveTypes.has(dataset.originalFile.mimetype)) {
    const dirName = datasetUtils.attachmentsDir(dataset)
    await decompress(dataset.originalFile.mimetype, originalFilePath, dirName)
    const files = await datasetUtils.lsAttachments(dataset)
    const fileNames = files.map(f => path.parse(f).base)
    const baseName = path.parse(dataset.originalFile.name).name
    // Check if this archive is actually a shapefile source
    if (fileNames.find(f => f === baseName + '.shp') && fileNames.find(f => f === baseName + '.shx') && fileNames.find(f => f === baseName + '.dbf')) {
      isShapefile = true
    } else {
      const csvFilePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
      // Either there is a data.csv in this archive and we use it as the main source for data related to the files, or we create it
      const csvContent = 'file\n' + files.map(f => `"${f}"`).join('\n') + '\n'
      await fs.writeFile(csvFilePath, csvContent)
      dataset.file = {
        name: path.parse(dataset.originalFile.name).name + '.csv',
        size: await fs.stat(csvFilePath).size,
        mimetype: 'text/csv',
        encoding: 'utf-8'
      }
      if (!dataset.schema.find(f => f.key === 'file')) {
        const concept = vocabulary.find(c => c.identifiers.includes('http://schema.org/DigitalDocument'))
        dataset.schema.push({
          key: 'attachment',
          'x-originalName': 'attachment',
          type: 'string',
          title: concept.title,
          description: concept.description,
          'x-refersTo': 'http://schema.org/DigitalDocument'
        })
      }
    }
  }

  if (calendarTypes.has(dataset.originalFile.mimetype)) {
    // TODO : store these file size limits in config file ?
    if (dataset.originalFile.size > 10 * 1000 * 1000) throw createError(400, 'File size of this format must not exceed 10 MB. You can however convert your file to CSV with an external tool and reupload it.')
    const { eventsStream, infos } = await icalendar.parse(originalFilePath)
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
    await pump(
      eventsStream,
      csvStringify({ columns: ['DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'CATEGORIES', 'STATUS', 'DESCRIPTION', 'TRANSP', 'SEQUENCE', 'GEO', 'URL'], header: true }),
      fs.createWriteStream(filePath)
    )
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: await fs.stat(filePath).size,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
    icalendar.prepareSchema(dataset, infos)
  } else if (tabularTypes.has(dataset.originalFile.mimetype)) {
    // TODO : store these file size limits in config file ?
    if (dataset.originalFile.size > 10 * 1000 * 1000) throw createError(400, 'File size of this format must not exceed 10 MB. You can however convert your file to CSV with an external tool and reupload it.')
    const workbook = XLSX.readFile(originalFilePath)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_csv(worksheet)
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.csv')
    await fs.writeFile(filePath, data)
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: await fs.stat(filePath).size,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
  } else if (isShapefile || geographicalTypes.has(dataset.originalFile.mimetype)) {
    if (dataset.originalFile.size > 100 * 1000 * 1000) throw createError(400, 'File size of this format must not exceed 10 MB. You can however convert your file to geoJSON with an external tool and reupload it.')
    const geoJsonStream = ogr2ogr(originalFilePath)
      .format('GeoJSON')
      .options(['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326'])
      // .skipfailures()
      .stream()
    const filePath = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.geojson')
    await pump(geoJsonStream, fs.createWriteStream(filePath))
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.geojson',
      size: await fs.stat(filePath).size,
      mimetype: 'application/geo+json',
      encoding: 'utf-8'
    }
  } else {
    // TODO: throw error ?
  }

  dataset.status = 'loaded'

  const patch = { status: dataset.status, file: dataset.file, schema: dataset.schema }
  if (dataset.timeZone) patch.timeZone = dataset.timeZone

  await db.collection('datasets').updateOne({ id: dataset.id }, {
    $set: patch
  })
}
