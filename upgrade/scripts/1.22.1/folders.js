const fs = require('fs-extra')
const config = require('config')
const path = require('path')
const datasetUtils = require('../../../server/utils/dataset')
const tilesUtils = require('../../../server/utils/tiles')
const esUtils = require('../../../server/utils/es')

exports.description = 'Dataset files are now stored in separate folders.'

const getPaths = (dataset) => {
  const parsedOriginalFile = dataset.originalFile && path.parse(dataset.originalFile.name)
  const ownerDir = path.join(config.dataDir, dataset.owner.type, dataset.owner.id)
  return {
    file: dataset.file && path.join(ownerDir, dataset.id + '.' + dataset.file.name.split('.').pop()),
    originalFile: dataset.originalFile && path.join(ownerDir, dataset.id + '.' + dataset.originalFile.name.split('.').pop()),
    attachmentsDir: path.join(ownerDir, dataset.id + '.attachments'),
    metadataAttachmentsDir: path.join(ownerDir, dataset.id + '.metadata-attachments'),
    newDir: path.join(ownerDir, 'datasets', dataset.id),
    newFullFile: parsedOriginalFile && path.join(ownerDir, 'datasets', dataset.id, `${parsedOriginalFile.name}-full${parsedOriginalFile.ext}`),
    newMbtilesFile: parsedOriginalFile && path.join(ownerDir, 'datasets', dataset.id, `${parsedOriginalFile.name}.mbtiles`),
    markerFile: path.join(config.dataDir, 'tmp', `upgrade-marker-${dataset.id}.txt`),
  }
}

exports.exec = async (db, debug) => {
  const es = await esUtils.init()
  let cursor = db.collection('datasets').find({})
  debug('loop on datasets to move all files')
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('work on dataset', dataset.id)

    const paths = getPaths(dataset)
    debug(`move all files to ${paths.newDir}`)

    // if (await fs.exists(paths.newDir)) continue
    await fs.ensureDir(paths.newDir)
    if (paths.file && await fs.exists(paths.file)) {
      await fs.move(paths.file, path.join(paths.newDir, dataset.file.name), { overwrite: true })
    }
    if (paths.originalFile && await fs.exists(paths.originalFile)) {
      await fs.move(paths.originalFile, path.join(paths.newDir, dataset.originalFile.name), { overwrite: true })
    }
    if (await fs.exists(paths.attachmentsDir)) {
      await fs.move(paths.attachmentsDir, path.join(paths.newDir, 'attachments'), { overwrite: true })
    }
    if (await fs.exists(paths.metadataAttachmentsDir)) {
      await fs.move(paths.metadataAttachmentsDir, path.join(paths.newDir, 'metadata-attachments'), { overwrite: true })
    }
  }

  debug('loop on datasets to create extended and vector tile files')
  cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    const paths = getPaths(dataset)
    if (await fs.exists(paths.markerFile)) {
      debug('files already produced for dataset', dataset.id)
      continue
    }

    if (dataset.extensions && dataset.extensions.find(e => e.active) && paths.newFullFile && !(await fs.exists(paths.newFullFile))) {
      debug('prepare full extended file', paths.newFullFile)
      try {
        await datasetUtils.writeFullFile(db, es, dataset)
      } catch (err) {
        console.error('Failure to create extended file', paths.newFullFile, err)
      }
    }

    if (dataset.bbox && !dataset.isRest && !dataset.isVirtual && !(await fs.exists(paths.newMbtilesFile))) {
      debug('prepare geo files', paths.newMbtilesFile)
      try {
        await tilesUtils.prepareMbtiles(dataset, db, es)
      } catch (err) {
        console.error('Failure to create mbtiles file', paths.newFullFile, err)
      }
    }

    await fs.ensureFile(paths.markerFile)
  }
  await es.close()
}
