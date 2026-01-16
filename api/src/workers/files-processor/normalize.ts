// convert from tabular data to csv or geographical data to geojson

import path from 'path'
import fs from 'fs-extra'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import pump from '../../misc/utils/pipe.ts'
import { Readable, compose } from 'node:stream'
import tmp from 'tmp-promise'
import mime from 'mime-types'
import resolvePath from 'resolve-path'
import { displayBytes } from '../../misc/utils/bytes.js'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetUtils from '../../datasets/utils/index.js'
import * as datasetService from '../../datasets/service.js'
import { fsyncFile, tmpDir as mainTmpDir } from '../../datasets/utils/files.ts'
import * as i18nUtils from '../../../i18n/utils.ts'
import config from '#config'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { DatasetInternal, FileDataset } from '#types'
import mimeTypeStream from 'mime-type-stream'
import { unzipFromStorage } from '../../misc/utils/unzip.ts'
import filesStorage from '#files-storage'

export const eventsPrefix = 'normalize'

const csvStringifyOptions = {
  bom: true,
  header: true,
  // quoted_string to prevent bugs with strings containing \r or other edge cases
  quoted_string: true,
  cast: {
    boolean: (value) => {
      if (value) return '1'
      if (value === false) return '0'
      return ''
    }
  }
}

export default async function (dataset: FileDataset) {
  const debug = debugLib(`worker:file-normalizer:${dataset.id}`)
  const originalFilePath = datasetUtils.originalFilePath(dataset)
  const baseName = path.parse(dataset.originalFile.name).name
  const tmpDir = (await tmp.dir({ tmpdir: mainTmpDir, unsafeCleanup: true, prefix: 'normalizer-' })).path

  try {
    if (!await filesStorage.pathExists(originalFilePath)) {
      // we should not have to do this
      // this is a weird thing, maybe an unsolved race condition ?
      // let's wait a bit and try again to mask this problem temporarily
      internalError('normalizer-missing-file', 'file missing when normalizer started working ' + originalFilePath)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    let shapefile: string | undefined
    let mapinfo: string | undefined
    if (dataset.originalFile.mimetype === 'application/zip') {
      debug('decompress', dataset.originalFile.mimetype, originalFilePath, tmpDir)
      const files = (await unzipFromStorage(originalFilePath, tmpDir)).filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
      const filePaths = files.map(f => ({ path: f, parsed: path.parse(f) }))

      // Check if this archive is actually a shapefile or a mapingosource
      const shpFile = filePaths.find(f => f.parsed.ext.toLowerCase().endsWith('.shp'))
      const mapinfoFile = filePaths.find(f => f.parsed.ext.toLowerCase().endsWith('.tab'))
      if (shpFile &&
        filePaths.find(f => f.parsed.name === shpFile.parsed.name && f.parsed.ext.toLowerCase().endsWith('.shx')) &&
        filePaths.find(f => f.parsed.name === shpFile.parsed.name && f.parsed.ext.toLowerCase().endsWith('.dbf'))) {
        shapefile = resolvePath(tmpDir, shpFile.path)
      } else if (mapinfoFile &&
        filePaths.find(f => f.parsed.name === mapinfoFile.parsed.name && f.parsed.ext.toLowerCase().endsWith('.map')) &&
        filePaths.find(f => f.parsed.name === mapinfoFile.parsed.name && f.parsed.ext.toLowerCase().endsWith('.id')) &&
        filePaths.find(f => f.parsed.name === mapinfoFile.parsed.name && f.parsed.ext.toLowerCase().endsWith('.dat'))) {
        mapinfo = resolvePath(tmpDir, mapinfoFile.path)
      } else if (filePaths.length === 1 && datasetUtils.basicTypes.includes(mime.lookup(filePaths[0].parsed.base) as string)) {
        // case of a single data file in an archive
        const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), filePaths[0].parsed.base)
        await filesStorage.moveFromFs(resolvePath(tmpDir, files[0]), filePath)
        dataset.file = {
          name: filePaths[0].parsed.base,
          size: (await filesStorage.fileStats(filePath)).size,
          mimetype: mime.lookup(filePaths[0].parsed.base) as string,
          encoding: 'utf-8',
          schema: []
        }
      } else {
        if (await filesStorage.pathExists(datasetUtils.attachmentsDir(dataset))) {
          throw httpError(400, '[noretry] Vous avez chargé un fichier zip comme fichier de données principal, mais il y a également des pièces jointes chargées.')
        }
        await filesStorage.moveDir(tmpDir, datasetUtils.attachmentsDir(dataset))
        const csvFilePath = resolvePath(datasetUtils.dataFilesDir(dataset), baseName + '.csv')
        // Either there is a data.csv in this archive and we use it as the main source for data related to the files, or we create it
        const csvContent = 'file\n' + files.map(f => `"${f}"`).join('\n') + '\n'
        await filesStorage.writeString(csvFilePath, csvContent)
        dataset.file = {
          name: path.parse(dataset.originalFile.name).name + '.csv',
          size: (await filesStorage.fileStats(csvFilePath)).size,
          mimetype: 'text/csv',
          encoding: 'utf-8',
          schema: []
        }
        if (!dataset.schema.find(f => f.key === 'file')) {
          const concept = i18nUtils.vocabulary[config.i18n.defaultLocale as 'en' | 'fr']['http://schema.org/DigitalDocument']
          console.log('add attachment')
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
      const zlib = await import('node:zlib')

      const basicTypeFileName = dataset.originalFile.name.slice(0, dataset.originalFile.name.length - 3)
      const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), basicTypeFileName)
      const readStream = compose((await filesStorage.readStream(originalFilePath)).body, zlib.createGunzip())
      await filesStorage.writeStream(readStream, filePath)
      const stats = await filesStorage.fileStats(filePath)
      dataset.file = {
        name: basicTypeFileName,
        size: stats.size,
        mimetype: mime.lookup(basicTypeFileName) as string,
        encoding: 'utf-8',
        schema: []
      }
    }

    if (datasetUtils.jsonTypes.has(dataset.originalFile.mimetype)) {
      const { stringify: csvStrStream } = await import('csv-stringify')
      const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), baseName + '.csv')
      const readStream = compose(
        (await filesStorage.readStream(originalFilePath)).body,
        mimeTypeStream(dataset.originalFile.mimetype).parser(),
        csvStrStream(csvStringifyOptions)
      )

      await filesStorage.writeStream(readStream, filePath)
      const stats = await filesStorage.fileStats(filePath)
      dataset.file = {
        name: baseName + '.csv',
        size: stats.size,
        mimetype: 'text/csv',
        encoding: 'utf-8',
        schema: []
      }
    } else if (datasetUtils.calendarTypes.has(dataset.originalFile.mimetype)) {
      // TODO : store these file size limits in config file ?
      if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
        throw httpError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
      }
      const icalendar = await import('../../misc/utils/icalendar.js')
      const { stringify: csvStrStream } = await import('csv-stringify')

      const { eventsStream, infos } = await icalendar.parse(originalFilePath)
      const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), baseName + '.csv')
      const columns = ['DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'CATEGORIES', 'STATUS', 'DESCRIPTION', 'TRANSP', 'SEQUENCE', 'GEO', 'URL']
      const readStream = compose(eventsStream, csvStrStream({ ...csvStringifyOptions, columns }))
      await filesStorage.writeStream(readStream, filePath)
      const stats = await filesStorage.fileStats(filePath)
      dataset.file = {
        name: baseName + '.csv',
        size: stats.size,
        mimetype: 'text/csv',
        encoding: 'utf-8',
        schema: []
      }
      icalendar.prepareSchema(dataset, infos)
      dataset.analysis = { escapeKeyAlgorithm: 'legacy' }
    } else if (datasetUtils.tabularTypes.has(dataset.originalFile.mimetype)) {
      if (dataset.originalFile.size > config.defaultLimits.maxSpreadsheetSize) {
        throw httpError(400, `[noretry] Un fichier de ce format ne peut pas excéder ${displayBytes(config.defaultLimits.maxSpreadsheetSize)}. Vous pouvez par contre le convertir en CSV avec un outil externe et le charger de nouveau.`)
      }
      const xlsx = await import('../../misc/utils/xlsx.ts')
      const tmpFile = await tmp.file({ tmpdir: tmpDir })
      await fs.ensureFile(tmpFile.path)
      await pump((await filesStorage.readStream(originalFilePath)).body, fs.createWriteStream(tmpFile.path))
      await fsyncFile(tmpFile.path)
      const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), baseName + '.csv')
      await filesStorage.writeStream(
        Readable.from(xlsx.iterCSV(tmpFile.path, dataset.originalFile.normalizeOptions)),
        filePath
      )
      const stats = await filesStorage.fileStats(filePath)
      dataset.file = {
        name: path.parse(dataset.originalFile.name).name + '.csv',
        size: stats.size,
        mimetype: 'text/csv',
        encoding: 'utf-8',
        schema: []
      }
      await tmpFile.cleanup()
    } else if (shapefile || mapinfo || datasetUtils.geographicalTypes.has(dataset.originalFile.mimetype)) {
      if (config.ogr2ogr.skip) {
        throw httpError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
      }
      const { default: ogr2ogr } = await import('ogr2ogr')
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

      const tmpFile = await tmp.tmpName({ tmpdir: tmpDir })
      const filePath = resolvePath(datasetUtils.dataFilesDir(dataset), baseName + '.geojson')
      // using the .shp file instead of the zip seems to help support more shapefiles for some reason
      await ogr2ogr(shapefile ?? mapinfo ?? originalFilePath, {
        format: 'GeoJSON',
        options: ogrOptions,
        timeout: config.ogr2ogr.timeout,
        destination: tmpFile
      })
      await filesStorage.moveFromFs(tmpFile, filePath)
      const stats = await filesStorage.fileStats(filePath)
      dataset.file = {
        name: path.parse(dataset.originalFile.name).name + '.geojson',
        size: stats.size,
        mimetype: 'application/geo+json',
        encoding: 'utf-8',
        schema: []
      }
    }
  } finally {
    if (await fs.exists(tmpDir)) await fs.remove(tmpDir)
  }

  if (!dataset.file) {
    throw httpError(400, `[noretry] Le format de ce fichier n'est pas supporté (${dataset.originalFile.mimetype}).`)
  }

  dataset.status = 'normalized'

  const patch: Partial<DatasetInternal> = { status: dataset.status, file: dataset.file, schema: dataset.schema }
  if (dataset.timeZone) patch.timeZone = dataset.timeZone
  if (dataset.analysis) patch.analysis = dataset.analysis

  await datasetService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset, false, true)
}
