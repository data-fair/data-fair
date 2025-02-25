import fs from 'fs-extra'
import { attachmentsDir, unzip } from '../../datasets/utils/files.js'

export const addAttachments = async (dataset, attachmentsArchive) => {
  const dir = attachmentsDir(dataset)
  await fs.ensureDir(dir)
  // await exec('unzip', ['-o', '-q', attachmentsArchive, '-d', dir])
  const files = await unzip(attachmentsArchive, dir)
  await fs.remove(attachmentsArchive)
  return files
}

export const replaceAllAttachments = async (dataset, attachmentsFilePath) => {
  const dir = attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await fs.emptyDir(dir)
  // await exec('unzip', ['-o', '-q', attachmentsFilePath, '-d', dir])
  const files = await unzip(attachmentsFilePath, dir)
  await fs.remove(attachmentsFilePath)
  return files
}

export const removeAll = async (dataset) => {
  await fs.remove(attachmentsDir(dataset))
}
