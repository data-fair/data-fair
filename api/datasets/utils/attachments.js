import fs from 'fs-extra'
import exec from '../../misc/utils/exec.js'
import { attachmentsDir } from '../../datasets/utils/files.js'

export const addAttachments = async (dataset, attachmentsArchive) => {
  const dir = attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await exec('unzip', ['-o', '-q', attachmentsArchive, '-d', dir])
  await fs.remove(attachmentsArchive)
}

export const replaceAllAttachments = async (dataset, attachmentsFilePath) => {
  const dir = attachmentsDir(dataset)
  await fs.ensureDir(dir)
  await fs.emptyDir(dir)
  await exec('unzip', ['-o', '-q', attachmentsFilePath, '-d', dir])
  await fs.remove(attachmentsFilePath)
}

export const removeAll = async (dataset) => {
  await fs.remove(attachmentsDir(dataset))
}
