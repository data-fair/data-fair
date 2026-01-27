import path from 'node:path'
import fs from 'fs-extra'
import filesStorage from '#files-storage'
import type { CentralDirectory } from 'unzipper'
import iconvLite from 'iconv-lite'
import chardet from 'chardet'
import { type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import unzipper from 'unzipper'
import { isInFilesStorage } from '../../files-storage/utils.ts'

const unzip = async (zipDirectory: CentralDirectory, targetDir: string, writeStream: (readStream: Readable, path: string) => Promise<void>) => {
  // we used to use the unzip command line tool but this patch (https://sourceforge.net/p/infozip/patches/29/)
  // was missing in the version in our alpine docker image
  // so we use unzipper with chardet + iconv-lite to manage encoded file names
  const fileNames = Buffer.concat(zipDirectory.files.map(f => f.pathBuffer))
  const encoding = chardet.detect(fileNames)
  const files: string[] = []
  for (const file of zipDirectory.files) {
    if (file.type === 'Directory') continue
    const filePath = (!file.isUnicode && encoding && encoding !== 'ASCII' && encoding !== 'UTF-8')
      ? iconvLite.decode(file.pathBuffer, 'CP437')
      : file.path
    files.push(filePath)
    const fullPath = path.join(targetDir, filePath)
    await writeStream(file.stream(), fullPath)
  }
  return files
}

export const unzipFromStorage = async (zipFile: string, targetDir: string) => {
  return unzip(await filesStorage.zipDirectory(zipFile), targetDir, async (readStream, p) => {
    await fs.ensureDir(path.parse(p).dir)
    const writeStream = fs.createWriteStream(p)
    await pipeline(readStream, writeStream)
  })
}

export const unzipIntoStorage = async (zipFile: string, targetDir: string) => {
  const zipDirectory = isInFilesStorage(zipFile) ? await filesStorage.zipDirectory(zipFile) : await unzipper.Open.file(zipFile)
  return unzip(zipDirectory, targetDir, (readStream, p) => filesStorage.writeStream(readStream, p))
}
