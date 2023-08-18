// convert from tabular data to csv or geographical data to geojson
const config = require('config')

exports.eventsPrefix = 'convert'

const archiveTypes = exports.archiveTypes = new Set([
  'application/zip' // .zip
  /* 'application/x-7z-compressed', // .7z
  'application/x-bzip', // .bzip
  'application/x-bzip2', // .bzip2
  'application/x-tar', // .tar */
])
const tabularTypes = exports.tabularTypes = new Set([
  'application/vnd.oasis.opendocument.spreadsheet', // ods, fods
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/dbase' // dbf
])
const geographicalTypes = exports.geographicalTypes = new Set([
  'application/vnd.google-earth.kml+xml', // kml
  'application/vnd.google-earth.kmz', // kmz
  'application/gpx+xml', // gpx or xml ?
  'application/geopackage+sqlite3' // gpkg
])
const calendarTypes = exports.calendarTypes = new Set(['text/calendar'])
exports.csvTypes = [
  'text/csv',
  'text/plain', // txt often contains csv or tsv content
  'text/tab-separated-values' // tsv processed in the same way as csv
]
exports.basicTypes = [
  ...exports.csvTypes,
  'application/geo+json'
]

async function decompress (mimetype, filePath, dirPath) {
  const exec = require('../utils/exec')
  if (mimetype === 'application/zip') await exec('unzip', ['-o', '-q', filePath, '-d', dirPath])
}

exports.process = async function (app, dataset) {
  const path = require('path')
  const fs = require('fs-extra')
  const createError = require('http-errors')
  const ogr2ogr = require('ogr2ogr').default
  const pump = require('../utils/pipe')
  const csvStringify = require('csv-stringify')
  const tmp = require('tmp-promise')
  const dir = require('node-dir')
  const mime = require('mime-types')
  const zlib = require('node:zlib')
  const { displayBytes } = require('../utils/bytes')
  const datasetUtils = require('../utils/dataset')
  const icalendar = require('../utils/icalendar')
  const xlsx = require('../utils/xlsx')
  const i18nUtils = require('../utils/i18n')

  const dataDir = path.resolve(config.dataDir)

  const debug = require('debug')(`worker:converter:${dataset.id}`)
  const db = app.get('db')
  const originalFilePath = datasetUtils.originalFilePath(dataset)
  const baseName = path.parse(dataset.originalFile.name).name
  const tmpDir = (await tmp.dir({ dir: path.join(dataDir, 'tmp') })).path

  let isShapefile = false
  if (archiveTypes.has(dataset.originalFile.mimetype)) {
    debug('decompress', dataset.originalFile.mimetype, originalFilePath, tmpDir)
    await decompress(dataset.originalFile.mimetype, originalFilePath, tmpDir)
    const files = (await dir.promiseFiles(tmpDir))
      .map(f => path.relative(tmpDir, f))
      .filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
    const filePaths = files.map(f => path.parse(f))

    // Check if this archive is actually a shapefile source
    const shpFile = filePaths.find(f => f.ext.toLowerCase().endsWith('.shp'))
    if (shpFile &&
        filePaths.find(f => f.name === shpFile.name && f.ext.toLowerCase().endsWith('.shx')) &&
        filePaths.find(f => f.name === shpFile.name && f.ext.toLowerCase().endsWith('.dbf'))) {
      isShapefile = true
    } else if (filePaths.length === 1 && exports.basicTypes.includes(mime.lookup(filePaths[0].base))) {
      // case of a single data file in an archive
      const filePath = path.join(datasetUtils.dir(dataset), filePaths[0].base)
      await fs.move(path.join(tmpDir, files[0]), filePath, { overwrite: true })
      dataset.file = {
        name: filePaths[0].base,
        size: await fs.stat(filePath).size,
        mimetype: mime.lookup(filePaths[0].base),
        encoding: 'utf-8'
      }
    } else {
      if (await fs.pathExists(datasetUtils.attachmentsDir(dataset))) {
        throw new Error('Vous avez chargé un fichier zip comme fichier de données principal, mais il y a également des pièces jointes chargées.')
      }
      await fs.move(tmpDir, datasetUtils.attachmentsDir(dataset))
      const csvFilePath = path.join(datasetUtils.dir(dataset), baseName + '.csv')
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
        const concept = i18nUtils.vocabulary[config.i18n.defaultLocale]['http://schema.org/DigitalDocument']
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

  if (dataset.originalFile.mimetype === 'application/gzip') {
    const basicTypeFileName = dataset.originalFile.name.slice(0, dataset.originalFile.name.length - 3)
    const filePath = path.join(datasetUtils.dir(dataset), basicTypeFileName)
    await pump(fs.createReadStream(originalFilePath), zlib.createGunzip(), fs.createWriteStream(filePath))
    dataset.file = {
      name: basicTypeFileName,
      size: await fs.stat(filePath).size,
      mimetype: mime.lookup(basicTypeFileName),
      encoding: 'utf-8'
    }
  }

  if (calendarTypes.has(dataset.originalFile.mimetype)) {
    // TODO : store these file size limits in config file ?
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const { eventsStream, infos } = await icalendar.parse(originalFilePath)
    const filePath = path.join(datasetUtils.dir(dataset), baseName + '.csv')
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
    dataset.analysis = { escapeKeyAlgorithm: 'legacy' }
  } else if (tabularTypes.has(dataset.originalFile.mimetype)) {
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const data = await xlsx.getCSV(originalFilePath)
    const filePath = path.join(datasetUtils.dir(dataset), baseName + '.csv')
    await fs.writeFile(filePath, data)
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: await fs.stat(filePath).size,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
  } else if (isShapefile || geographicalTypes.has(dataset.originalFile.mimetype)) {
    if (config.ogr2ogr.skip) {
      throw createError(400, 'Les fichiers de type shapefile ne sont pas supportés sur ce service.')
    }
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const ogrOptions = ['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326']
    if (dataset.originalFile.mimetype === 'application/gpx+xml') {
      // specify the layers we want to keep from gpx files (tracks and routes), and rename the output geojson layer
      ogrOptions.push('-nln')
      ogrOptions.push(dataset.id)
      ogrOptions.push('tracks')
      ogrOptions.push('routes')
    }

    const filePath = path.join(datasetUtils.dir(dataset), baseName + '.geojson')
    await ogr2ogr(originalFilePath, {
      format: 'GeoJSON',
      options: ogrOptions,
      timeout: config.ogr2ogr.timeout,
      destination: filePath
    })

    // await pump(geoJsonStream, fs.createWriteStream(filePath))
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.geojson',
      size: await fs.stat(filePath).size,
      mimetype: 'application/geo+json',
      encoding: 'utf-8'
    }
  } else {
    // TODO: throw error ?
  }

  await fs.remove(tmpDir)

  dataset.status = 'loaded'

  const patch = { status: dataset.status, file: dataset.file, schema: dataset.schema }
  if (dataset.timeZone) patch.timeZone = dataset.timeZone
  if (dataset.analysis) patch.analysis = dataset.analysis

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
