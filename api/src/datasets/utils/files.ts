import config from '#config'
import fs from 'fs-extra'
import path from 'path'
import resolvePath from 'resolve-path' // safe replacement for path.resolve
import { type Account } from '@data-fair/lib-express'
import debugModule from 'debug'
import filesStorage from '#files-storage'
import { isMainThread } from 'node:worker_threads'

const debugCleanTmp = debugModule('clean-tmp')
debugCleanTmp.enabled = true

export const dataDir = path.resolve(config.dataDir)

// this distinction is to separate tmp directories when testing to simulate a multi-process environment
const relTmpDir = isMainThread ? config.tmpDir : (config.workerTmpDir ?? config.tmpDir)
export const tmpDir = relTmpDir ? path.resolve(relTmpDir) : path.join(dataDir, 'tmp')

export const ownerDir = (owner: Account) => {
  return resolvePath(dataDir, path.join(owner.type, owner.id))
}

export const dir = (dataset: any) => {
  return resolvePath(
    ownerDir(dataset.owner),
    path.join(dataset.draftReason ? 'datasets-drafts' : 'datasets', dataset.id)
  )
}

export const loadingDir = (dataset: any) => {
  return resolvePath(dir(dataset), 'loading')
}

export const dataFilesDir = (dataset: any) => {
  return resolvePath(dir(dataset), 'data-files')
}

export const loadedFilePath = (dataset: any) => {
  return resolvePath(loadingDir(dataset), dataset.loaded?.dataset?.name)
}

export const filePath = (dataset: any) => {
  return resolvePath(dataFilesDir(dataset), dataset.file.name)
}

export const originalFilePath = (dataset: any) => {
  return resolvePath(dataFilesDir(dataset), dataset.originalFile.name)
}

export const fullFileName = (dataset: any) => {
  const parsed = path.parse(dataset.file.name)
  return `${parsed.name}-full${parsed.ext}`
}

export const fullFilePath = (dataset: any) => {
  return resolvePath(dataFilesDir(dataset), fullFileName(dataset))
}

export const loadedAttachmentsFilePath = (dataset: any) => {
  return resolvePath(loadingDir(dataset), 'attachments.zip')
}

export const attachmentsDir = (dataset: any) => {
  return resolvePath(dir(dataset), 'attachments')
}

export const attachmentPath = (dataset: any, name: string) => {
  return resolvePath(attachmentsDir(dataset), name)
}

export const metadataAttachmentsDir = (dataset: any) => {
  return resolvePath(dir(dataset), 'metadata-attachments')
}

export const metadataAttachmentPath = (dataset: any, name: string) => {
  return resolvePath(metadataAttachmentsDir(dataset), name)
}

export const lsAttachments = async (dataset: any) => {
  const files = await filesStorage.lsr(attachmentsDir(dataset))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

export const lsMetadataAttachments = async (dataset: any) => {
  return await filesStorage.lsr(metadataAttachmentsDir(dataset))
}

export const dataFiles = async (dataset: any, publicBaseUrl = config.publicUrl) => {
  if (dataset.isVirtual || dataset.isMetaOnly) return []
  const d = dataFilesDir(dataset)
  const files = await filesStorage.lsrWithStats(d)
  const results: any[] = []
  if (dataset.originalFile) {
    const originalFile = files.find(f => f.path === dataset.originalFile.name)
    if (!originalFile) {
      console.warn('Original data file not found', d, dataset.originalFile.name)
    } else {
      results.push({
        name: dataset.originalFile.name,
        key: 'original',
        title: 'Fichier d\'origine',
        mimetype: dataset.originalFile.mimetype,
        size: originalFile.size,
        updatedAt: originalFile.lastModified
      })
    }
    if (dataset.file) {
      if (dataset.file.name !== dataset.originalFile.name) {
        const file = files.find(f => f.path === dataset.file.name)
        if (!file) {
          console.warn('Normalized data file not found', d, dataset.file.name)
        } else {
          results.push({
            name: dataset.file.name,
            key: 'normalized',
            title: `Export ${dataset.file.mimetype.split('/').pop().replace('+', '').toUpperCase()}`,
            mimetype: dataset.file.mimetype,
            size: file.size,
            updatedAt: file.lastModified
          })
        }
      }
      const parsed = path.parse(dataset.file.name)
      if (dataset.extensions && !!dataset.extensions.find(e => e.active)) {
        const name = `${parsed.name}-full${parsed.ext}`
        const fullFile = files.find(f => f.path === name)
        if (!fullFile) {
          console.warn('Full data file not found', d, name)
        } else {
          results.push({
            name,
            key: 'full',
            title: `Fichier enrichi ${dataset.file.mimetype.split('/').pop().replace('+', '').toUpperCase()}`,
            mimetype: dataset.file.mimetype,
            size: fullFile.size,
            updatedAt: fullFile.lastModified
          })
        }
      }
    }
  }

  for (const result of results) {
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
export const fsyncFile = async (p: string) => {
  const fd = await fs.open(p, 'r')
  await fs.fsync(fd)
  await fs.close(fd)
}

export const cleanTmp = async () => {
  debugCleanTmp('check tmp dir for old files')
  const delay = 7 * 24 * 60 * 60 * 1000 // 7 days
  await fs.ensureDir(tmpDir)
  const dir = await fs.opendir(tmpDir)
  for await (const dirent of dir) {
    const stats = await fs.stat(path.join(tmpDir, dirent.name))
    if (stats.mtimeMs < Date.now() - delay) {
      debugCleanTmp(`remove old ${dirent.isDirectory() ? 'directory' : 'file'} ${dirent.name} - ${stats.mtime}`)
      try {
        await fs.remove(path.join(tmpDir, dirent.name))
      } catch (e) {
        // ignore error if file has been deleted in the meantime
      }
    }
  }

  // there is also a "tmp" directory in the shared files storage
  const files = await filesStorage.lsrWithStats(path.join(dataDir, 'shared-tmp'))
  for (const file of files) {
    if (file.lastModified.getTime() < Date.now() - delay) {
      debugCleanTmp(`remove old file ${file.path} - ${file.lastModified.toISOString()}`)
      try {
        await fs.remove(path.join(dataDir, 'shared-tmp', file.path))
      } catch (e) {
        // ignore error if file has been deleted in the meantime
      }
    }
  }
}
