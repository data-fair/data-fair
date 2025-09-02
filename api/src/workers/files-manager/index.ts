import mongo from '#mongo'
import es from '#es'
import type { Dataset } from '#types'

export const initialize = async function (dataset: Dataset) {
  await mongo.connect(true)
  await es.connect()
  const initialize = await import('./initialize.ts')
  await initialize.default(dataset)
}

export const downloadFile = async function (dataset: Dataset) {
  await mongo.connect(true)
  const downloadFile = await import('./download-file.ts')
  await downloadFile.default(dataset)
}

export const storeFile = async function (dataset: Dataset) {
  await mongo.connect(true)
  const storeFile = await import('./store-file.ts')
  await storeFile.default(dataset)
}
