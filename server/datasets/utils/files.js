const config = /** @type {any} */(require('config'))
const fs = require('fs-extra')
const path = require('path')
const dir = require('node-dir')
const resolvePath = require('resolve-path') // safe replacement for path.resolve

const dataDir = exports.dataDir = path.resolve(config.dataDir)

exports.tmpDir = path.join(dataDir, 'tmp')

const ownerDir = exports.ownerDir = (owner) => {
  return resolvePath(dataDir, path.join(owner.type, owner.id))
}

exports.dir = (dataset) => {
  return resolvePath(
    ownerDir(dataset.owner),
    path.join(dataset.draftReason ? 'datasets-drafts' : 'datasets', dataset.id)
  )
}

exports.loadingDir = (dataset) => {
  return resolvePath(exports.dir(dataset), 'loading')
}

exports.loadedFilePath = (dataset) => {
  return resolvePath(exports.loadingDir(dataset), dataset.loaded?.dataset?.name)
}

exports.filePath = (dataset) => {
  return resolvePath(exports.dir(dataset), dataset.file.name)
}

exports.originalFilePath = (dataset) => {
  return resolvePath(exports.dir(dataset), dataset.originalFile.name)
}

exports.fullFileName = (dataset) => {
  const parsed = path.parse(dataset.file.name)
  return `${parsed.name}-full${parsed.ext}`
}

exports.fullFilePath = (dataset) => {
  return resolvePath(exports.dir(dataset), exports.fullFileName(dataset))
}

exports.exportedFilePath = (dataset, ext) => {
  return resolvePath(exports.dir(dataset), `${dataset.id}-last-export${ext}`)
}

exports.loadedAttachmentsFilePath = (dataset) => {
  return resolvePath(exports.loadingDir(dataset), 'attachments.zip')
}

exports.attachmentsDir = (dataset) => {
  return resolvePath(exports.dir(dataset), 'attachments')
}

exports.attachmentPath = (dataset, name) => {
  return resolvePath(exports.attachmentsDir(dataset), name)
}

exports.metadataAttachmentsDir = (dataset) => {
  return resolvePath(exports.dir(dataset), 'metadata-attachments')
}

exports.metadataAttachmentPath = (dataset, name) => {
  return resolvePath(exports.metadataAttachmentsDir(dataset), name)
}

exports.lsAttachments = async (dataset) => {
  const dirName = exports.attachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

exports.lsMetadataAttachments = async (dataset) => {
  const dirName = exports.metadataAttachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

exports.lsFiles = async (dataset) => {
  const infos = {}
  if (dataset.file) {
    const filePath = exports.filePath(dataset)
    infos.file = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.originalFile) {
    const filePath = exports.originalFilePath(dataset)
    infos.originalFile = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    const dirPath = exports.attachmentsDir(dataset)
    const paths = await exports.lsAttachments(dataset)
    const files = []
    for (const p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

exports.dataFiles = async (dataset, publicBaseUrl = config.publicUrl) => {
  if (dataset.isVirtual || dataset.isMetaOnly) return []
  const dir = exports.dir(dataset)
  if (!await fs.pathExists(dir)) {
    return []
  }
  const files = await fs.readdir(dir)
  const results = []
  if (dataset.originalFile) {
    if (!files.includes(dataset.originalFile.name)) {
      console.warn('Original data file not found', dir, dataset.originalFile.name)
    } else {
      results.push({
        name: dataset.originalFile.name,
        key: 'original',
        title: 'Fichier d\'origine',
        mimetype: dataset.originalFile.mimetype
      })
    }
    if (dataset.file) {
      if (dataset.file.name !== dataset.originalFile.name) {
        if (!files.includes(dataset.file.name)) {
          console.warn('Normalized data file not found', dir, dataset.file.name)
        } else {
          results.push({
            name: dataset.file.name,
            key: 'normalized',
            title: `Export ${dataset.file.mimetype.split('/').pop().replace('+', '').toUpperCase()}`,
            mimetype: dataset.file.mimetype
          })
        }
      }
      const parsed = path.parse(dataset.file.name)
      if (dataset.extensions && !!dataset.extensions.find(e => e.active)) {
        const name = `${parsed.name}-full${parsed.ext}`
        if (!files.includes(name)) {
          console.warn('Full data file not found', path.join(dir, name))
        } else {
          results.push({
            name,
            key: 'full',
            title: `Fichier enrichi ${dataset.file.mimetype.split('/').pop().replace('+', '').toUpperCase()}`,
            mimetype: dataset.file.mimetype
          })
        }
      }
    }
  }
  if (dataset.isRest && dataset?.exports?.restToCSV?.active && dataset?.exports?.restToCSV?.lastExport) {
    const name = `${dataset.id}-last-export.csv`
    if (!files.includes(name)) {
      console.warn('Exported data file not found', path.join(dir, name))
    } else {
      results.push({
        name,
        key: 'export-csv',
        title: 'Export CSV',
        mimetype: 'text/csv'
      })
    }
  }

  for (const result of results) {
    const stats = await fs.stat(resolvePath(exports.dir(dataset), result.name))
    result.size = stats.size
    result.updatedAt = stats.mtime
    let url = `${publicBaseUrl}/api/v1/datasets/${dataset.id}/data-files/${result.name}`
    if (dataset.draftReason) {
      url += '?draft=true'
      result.title += ' - brouillon'
    }
    result.url = url
  }
  return results
}
