const config = /** @type {any} */(require('config'))
const fs = require('fs-extra')
const path = require('path')
const dir = require('node-dir')
const resolvePath = require('resolve-path') // safe replacement for path.resolve

const dataDir =  export const dataDir = path.resolve(config.dataDir)

 export const tmpDir = path.join(dataDir, 'tmp')

const ownerDir =  export const ownerDir = (owner) => {
  return resolvePath(dataDir, path.join(owner.type, owner.id))
}

 export const dir = (dataset) => {
  return resolvePath(
    ownerDir(dataset.owner),
    path.join(dataset.draftReason ? 'datasets-drafts' : 'datasets', dataset.id)
  )
}

 export const loadingDir = (dataset) => {
  return resolvePath( export const dir(dataset), 'loading')
}

 export const loadedFilePath = (dataset) => {
  return resolvePath( export const loadingDir(dataset), dataset.loaded?.dataset?.name)
}

 export const filePath = (dataset) => {
  return resolvePath( export const dir(dataset), dataset.file.name)
}

 export const originalFilePath = (dataset) => {
  return resolvePath( export const dir(dataset), dataset.originalFile.name)
}

 export const fullFileName = (dataset) => {
  const parsed = path.parse(dataset.file.name)
  return `${parsed.name}-full${parsed.ext}`
}

 export const fullFilePath = (dataset) => {
  return resolvePath( export const dir(dataset),  export const fullFileName(dataset))
}

 export const exportedFilePath = (dataset, ext) => {
  return resolvePath( export const dir(dataset), `${dataset.id}-last-export${ext}`)
}

 export const loadedAttachmentsFilePath = (dataset) => {
  return resolvePath( export const loadingDir(dataset), 'attachments.zip')
}

 export const attachmentsDir = (dataset) => {
  return resolvePath( export const dir(dataset), 'attachments')
}

 export const attachmentPath = (dataset, name) => {
  return resolvePath( export const attachmentsDir(dataset), name)
}

 export const metadataAttachmentsDir = (dataset) => {
  return resolvePath( export const dir(dataset), 'metadata-attachments')
}

 export const metadataAttachmentPath = (dataset, name) => {
  return resolvePath( export const metadataAttachmentsDir(dataset), name)
}

 export const lsAttachments = async (dataset) => {
  const dirName =  export const attachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

 export const lsMetadataAttachments = async (dataset) => {
  const dirName =  export const metadataAttachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

 export const lsFiles = async (dataset) => {
  const infos = {}
  if (dataset.file) {
    const filePath =  export const filePath(dataset)
    infos.file = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.originalFile) {
    const filePath =  export const originalFilePath(dataset)
    infos.originalFile = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    const dirPath =  export const attachmentsDir(dataset)
    const paths = await  export const lsAttachments(dataset)
    const files = []
    for (const p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

 export const dataFiles = async (dataset, publicBaseUrl = config.publicUrl) => {
  if (dataset.isVirtual || dataset.isMetaOnly) return []
  const dir =  export const dir(dataset)
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
    const stats = await fs.stat(resolvePath( export const dir(dataset), result.name))
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

// try to prevent weird bug with NFS by forcing syncing new files before use
/**
 * @param {string} p
 */
 export const fsyncFile = async (p) => {
  const fd = await fs.open(p, 'r')
  await fs.fsync(fd)
  await fs.close(fd)
}
