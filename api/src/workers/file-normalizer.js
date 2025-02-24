// convert from tabular data to csv or geographical data to geojson

import { pipeline } from 'node:stream/promises'
import path from 'path'
import fs from 'fs-extra'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import ogr2ogr from 'ogr2ogr'
import pump from '../misc/utils/pipe.js'
import { stringify as csvStrStream } from 'csv-stringify'
import tmp from 'tmp-promise'
import dir from 'node-dir'
import mime from 'mime-types'
import zlib from 'node:zlib'
import resolvePath from 'resolve-path'
import { displayBytes } from '../misc/utils/bytes.js'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetService from '../datasets/service.js'
import { tmpDir as mainTmpDir, unzip } from '../datasets/utils/files.js'
import * as icalendar from '../misc/utils/icalendar.js'
import * as xlsx from '../misc/utils/xlsx.js'
import * as i18nUtils from '../../i18n/utils.js'
import config from '#config'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'

export const eventsPrefix = 'normalize'

async function decompress (mimetype, filePath, dirPath) {
  if (mimetype === 'application/zip') {
    await unzip(filePath, dirPath)
    // await exec('unzip', ['-o', '-q', filePath, '-d', dirPath])
  }
}

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:file-normalizer:${dataset.id}`)
  const originalFilePath = datasetUtils.originalFilePath(dataset)
  const baseName = path.parse(dataset.originalFile.name).name
  const tmpDir = (await tmp.dir({ tmpdir: mainTmpDir, unsafeCleanup: true })).path

  if (!await fs.pathExists(originalFilePath)) {
    // we should not have to do this
    // this is a weird thing, maybe an unsolved race condition ?
    // let's wait a bit and try again to mask this problem temporarily
    internalError('normalizer-missing-file', 'file missing when normalizer started working ' + originalFilePath)
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  let isShapefile = false
  if (datasetUtils.archiveTypes.has(dataset.originalFile.mimetype)) {
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
    } else if (filePaths.length === 1 && datasetUtils.basicTypes.includes(mime.lookup(filePaths[0].base))) {
      // case of a single data file in an archive
      const filePath = resolvePath(datasetUtils.dir(dataset), filePaths[0].base)
      await fs.move(resolvePath(tmpDir, files[0]), filePath, { overwrite: true })
      dataset.file = {
        name: filePaths[0].base,
        size: await fs.stat(filePath).size,
        mimetype: mime.lookup(filePaths[0].base),
        encoding: 'utf-8'
      }
    } else {
      if (await fs.pathExists(datasetUtils.attachmentsDir(dataset))) {
        throw httpError(400, '[noretry] Vous avez chargé un fichier zip comme fichier de données principal, mais il y a également des pièces jointes chargées.')
      }
      await fs.move(tmpDir, datasetUtils.attachmentsDir(dataset))
      const csvFilePath = resolvePath(datasetUtils.dir(dataset), baseName + '.csv')
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
    const filePath = resolvePath(datasetUtils.dir(dataset), basicTypeFileName)
    await pump(fs.createReadStream(originalFilePath), zlib.createGunzip(), fs.createWriteStream(filePath))
    dataset.file = {
      name: basicTypeFileName,
      size: await fs.stat(filePath).size,
      mimetype: mime.lookup(basicTypeFileName),
      encoding: 'utf-8'
    }
  }

  if (datasetUtils.calendarTypes.has(dataset.originalFile.mimetype)) {
    // TODO : store these file size limits in config file ?
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw httpError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const { eventsStream, infos } = await icalendar.parse(originalFilePath)
    const filePath = resolvePath(datasetUtils.dir(dataset), baseName + '.csv')
    await pump(
      eventsStream,
      csvStrStream({ columns: ['DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'CATEGORIES', 'STATUS', 'DESCRIPTION', 'TRANSP', 'SEQUENCE', 'GEO', 'URL'], header: true }),
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
  } else if (datasetUtils.tabularTypes.has(dataset.originalFile.mimetype)) {
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      throw httpError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const filePath = resolvePath(datasetUtils.dir(dataset), baseName + '.csv')
    await pipeline(xlsx.iterCSV(originalFilePath), fs.createWriteStream(filePath))
    dataset.file = {
      name: path.parse(dataset.originalFile.name).name + '.csv',
      size: await fs.stat(filePath).size,
      mimetype: 'text/csv',
      encoding: 'utf-8'
    }
  } else if (isShapefile || datasetUtils.geographicalTypes.has(dataset.originalFile.mimetype)) {
    if (config.ogr2ogr.skip) {
      throw httpError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
    }
    if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
      // this rule is deactivated as ogr2ogr actually seems to take a negligible amount of RAM
      // for the transformation we use it for
      // throw httpError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
    }
    const ogrOptions = ['-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326']
    if (dataset.originalFile.mimetype === 'application/gpx+xml') {
      // specify the layers we want to keep from gpx files (tracks and routes), and rename the output geojson layer
      ogrOptions.push('-nln')
      ogrOptions.push(dataset.id)
      ogrOptions.push('tracks')
      ogrOptions.push('routes')
    }

    const filePath = resolvePath(datasetUtils.dir(dataset), baseName + '.geojson')
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
  }

  await fs.remove(tmpDir)

  if (!dataset.file) {
    throw httpError(400, `[noretry] Le format de ce fichier n'est pas supporté (${dataset.originalFile.mimetype}).`)
  }

  dataset.status = 'normalized'

  const patch = { status: dataset.status, file: dataset.file, schema: dataset.schema }
  if (dataset.timeZone) patch.timeZone = dataset.timeZone
  if (dataset.analysis) patch.analysis = dataset.analysis

  await datasetService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
