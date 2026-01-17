import { join as joinPath } from 'path'
import type { Dataset } from '#types'
import filesStorage from '#files-storage'
import { attachmentsDir } from './files.ts'
import { unzipIntoStorage } from '../../misc/utils/unzip.ts'

export const addAttachments = async (dataset: Dataset, loadedAttachmentsZipPath: string) => {
  const files = await unzipIntoStorage(loadedAttachmentsZipPath, attachmentsDir(dataset))
  await filesStorage.removeFile(loadedAttachmentsZipPath)
  return files
}

export const replaceAllAttachments = async (dataset: Dataset, loadedAttachmentsZipPath: string) => {
  const dir = attachmentsDir(dataset)
  const existingAttachments = await filesStorage.lsr(dir)
  const files = await unzipIntoStorage(loadedAttachmentsZipPath, dir)
  for (const a of existingAttachments) {
    if (!files.includes(a)) {
      await filesStorage.removeFile(joinPath(dir, a))
    }
  }
  return files
}

export const removeAll = async (dataset: Dataset) => {
  await filesStorage.removeDir(attachmentsDir(dataset))
}
