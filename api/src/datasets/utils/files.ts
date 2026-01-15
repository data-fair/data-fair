import config from '#config'
import fs from 'fs-extra'
import path from 'path'
import nodeDir from 'node-dir'
import resolvePath from 'resolve-path' // safe replacement for path.resolve
import unzipper from 'unzipper'
import iconvLite from 'iconv-lite'
import chardet from 'chardet'
import { type Account } from '@data-fair/lib-express'
import debugModule from 'debug'

const debugCleanTmp = debugModule('clean-tmp')
debugCleanTmp.enabled = true

export const dataDir = path.resolve(config.dataDir)

export const tmpDir = path.join(dataDir, 'tmp')

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
  const dirName = attachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await nodeDir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

export const lsMetadataAttachments = async (dataset: any) => {
  const dirName = metadataAttachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await nodeDir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

export const lsFiles = async (dataset: any) => {
  const infos: any = {}
  if (dataset.file) {
    const fp = filePath(dataset)
    infos.file = { filePath: fp, size: (await fs.promises.stat(fp)).size }
  }
  if (dataset.originalFile) {
    const filePath = originalFilePath(dataset)
    infos.originalFile = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    const dirPath = attachmentsDir(dataset)
    const paths = await lsAttachments(dataset)
    const files = []
    for (const p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

export const dataFiles = async (dataset: any, publicBaseUrl = config.publicUrl) => {
  if (dataset.isVirtual || dataset.isMetaOnly) return []
  const d = dataFilesDir(dataset)
  if (!await fs.pathExists(d)) {
    return []
  }
  const files = await fs.readdir(d)
  const results: any[] = []
  if (dataset.originalFile) {
    if (!files.includes(dataset.originalFile.name)) {
      console.warn('Original data file not found', d, dataset.originalFile.name)
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
          console.warn('Normalized data file not found', d, dataset.file.name)
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
          console.warn('Full data file not found', d, name)
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

  for (const result of results) {
    const stats = await fs.stat(resolvePath(dataFilesDir(dataset), result.name))
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
}

export const unzip = async (zipFile: string, targetDir: string) => {
  // we used to use the unzip command line tool but this patch (https://sourceforge.net/p/infozip/patches/29/)
  // was missing in the version in our alpine docker image
  // so we use unzipper with chardet + iconv-lite to manage encoded file names
  const directory = await unzipper.Open.file(zipFile)
  const fileNames = Buffer.concat(directory.files.map(f => f.pathBuffer))
  const encoding = chardet.detect(fileNames)
  const files: string[] = []
  for (const file of directory.files) {
    if (file.type === 'Directory') continue
    const filePath = (!file.isUnicode && encoding && encoding !== 'ASCII' && encoding !== 'UTF-8')
      ? iconvLite.decode(file.pathBuffer, 'CP437')
      : file.path
    files.push(filePath)
    const fullPath = path.join(targetDir, filePath)
    await fs.ensureDir(path.dirname(fullPath))
    await new Promise<void>((resolve, reject) => {
      file
        .stream()
        .pipe(fs.createWriteStream(fullPath))
        .on('error', reject)
        .on('finish', resolve)
    })
  }
  return files
}
