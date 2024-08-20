const config = /** @type {any} */(require('config'))
const { pipeline } = require('node:stream').promises
const path = require('path')
const fs = require('fs-extra')
const createError = require('http-errors')
const ogr2ogr = require('ogr2ogr').default
const pump = require('../../misc/utils/pipe')
const { stringify: csvStrStream } = require('csv-stringify')
const tmp = require('tmp-promise')
const dir = require('node-dir')
const mime = require('mime-types')
const zlib = require('node:zlib')
const resolvePath = require('resolve-path')
const { displayBytes } = require('../../misc/utils/bytes')
const datasetUtils = require('../../datasets/utils')
const { tmpDir: mainTmpDir, basicTypes, tabularTypes, geographicalTypes, archiveTypes, calendarTypes } = require('../../datasets/utils/files')
const icalendar = require('../../misc/utils/icalendar')
const xlsx = require('../../misc/utils/xlsx')
const i18nUtils = require('../../i18n/utils')
const metrics = require('../../misc/utils/metrics')

exports.eventsPrefix = 'normalize'

async function decompress (mimetype, filePath, dirPath) {
  const exec = require('../../misc/utils/exec')
  if (mimetype === 'application/zip') await exec('unzip', ['-o', '-q', filePath, '-d', dirPath])
}

exports.process = async function (app, dataset, patch) {
  const debug = require('debug')(`worker:file-normalizer:${dataset.id}`)
  const originalFilePath = datasetUtils.loadedFilePath(dataset)
  const baseName = path.parse(dataset.originalFile.name).name
  const tmpDir = (await tmp.dir({ dir: mainTmpDir, unsafeCleanup: true })).path

  if (!await fs.pathExists(originalFilePath)) {
    // we should not have to do this
    // this is a weird thing, maybe an unsolved race condition ?
    // let's wait a bit and try again to mask this problem temporarily
    metrics.internalError('normalizer-missing-file', 'file missing when normalizer started working ' + originalFilePath)
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

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
    } else if (filePaths.length === 1 && basicTypes.includes(mime.lookup(filePaths[0].base))) {
      // case of a single data file in an archive
      const fileName = filePaths[0].base
      dataset.file = {
        name: fileName,
        mimetype: mime.lookup(filePaths[0].base),
        encoding: 'utf-8'
      }
      const filePath = datasetUtils.filePath(dataset, true)
      await fs.move(resolvePath(tmpDir, files[0]), filePath, { overwrite: true })
      dataset.file.size = (await fs.stat(filePath)).size
    } else {
      if (await fs.pathExists(datasetUtils.loadedAttachmentsDir(dataset))) {
        throw createError(400, '[noretry] Vous avez chargé un fichier zip comme fichier de données principal, mais il y a également des pièces jointes chargées.')
      }
      await fs.move(tmpDir, datasetUtils.loadedAttachmentsDir(dataset))
      const fileName = baseName + '.csv'
      dataset.file = {
        name: fileName,
        mimetype: 'text/csv',
        encoding: 'utf-8'
      }
      const filePath = datasetUtils.filePath(dataset, true)
      // Either there is a data.csv in this archive and we use it as the main source for data related to the files, or we create it
      const csvContent = 'file\n' + files.map(f => `"${f}"`).join('\n') + '\n'
      await fs.writeFile(filePath, csvContent)
      dataset.file.size = (await fs.stat(filePath)).size

      if (!dataset.schema.find(f => f.key === 'file')) {
        const concept = i18nUtils.vocabulary[config.i18n.defaultLocale]['http://schema.org/DigitalDocument']
        dataset.schema.push({
          key: 'file',
          'x-originalName': 'file',
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
    dataset.file = {
      name: basicTypeFileName,
      mimetype: mime.lookup(basicTypeFileName),
      encoding: 'utf-8'
    }
    const filePath = datasetUtils.filePath(dataset, true)
    await pump(fs.createReadStream(originalFilePath), zlib.createGunzip(), fs.createWriteStream(filePath))
    dataset.file.size = (await fs.stat(filePath)).size
  }

  if (calendarTypes.has(dataset.originalFile.mimetype)) {
    // TODO : store these file size limits in config file ?
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const { eventsStream, infos } = await icalendar.parse(originalFilePath)
    const fileName = baseName + '.csv'
    dataset.file = {
      name: fileName,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
    const filePath = datasetUtils.filePath(dataset, true)
    await pump(
      eventsStream,
      csvStrStream({ columns: ['DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'CATEGORIES', 'STATUS', 'DESCRIPTION', 'TRANSP', 'SEQUENCE', 'GEO', 'URL'], header: true }),
      fs.createWriteStream(filePath)
    )
    dataset.file.size = (await fs.stat(filePath)).size
    icalendar.prepareSchema(dataset, infos)
    dataset.analysis = { escapeKeyAlgorithm: 'legacy' }
  } else if (tabularTypes.has(dataset.originalFile.mimetype)) {
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const fileName = baseName + '.csv'
    dataset.file = {
      name: fileName,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
    const filePath = datasetUtils.filePath(dataset, true)
    await pipeline(xlsx.iterCSV(originalFilePath), fs.createWriteStream(filePath))
    dataset.file.size = (await fs.stat(filePath)).size
  } else if (isShapefile || geographicalTypes.has(dataset.originalFile.mimetype)) {
    if (config.ogr2ogr.skip) {
      throw createError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
    }
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw createError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const ogrOptions = ['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326']
    if (dataset.originalFile.mimetype === 'application/gpx+xml') {
      // specify the layers we want to keep from gpx files (tracks and routes), and rename the output geojson layer
      ogrOptions.push('-nln')
      ogrOptions.push(dataset.id)
      ogrOptions.push('tracks')
      ogrOptions.push('routes')
    }

    const fileName = baseName + '.geojson'
    dataset.file = {
      name: fileName,
      mimetype: 'application/geo+json',
      encoding: 'utf-8'
    }
    const filePath = datasetUtils.filePath(dataset, true)
    await ogr2ogr(originalFilePath, {
      format: 'GeoJSON',
      options: ogrOptions,
      timeout: config.ogr2ogr.timeout,
      destination: filePath
    })
    dataset.file.size = (await fs.stat(filePath)).size
  }

  await fs.remove(tmpDir)

  if (!dataset.file) {
    throw createError(400, `[noretry] Le format de ce fichier n'est pas supporté (${dataset.originalFile.mimetype}).`)
  }

  patch.file = dataset.file
  patch.schema = dataset.schema
  if (dataset.timeZone) patch.timeZone = dataset.timeZone
  if (dataset.analysis) patch.analysis = dataset.analysis
}
