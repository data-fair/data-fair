import mongo from '#mongo'
import type { FileDataset, RestDataset, Dataset } from '#types'

export const extend = async function (dataset: Dataset) {
  await mongo.connect(true)
  const extend = await import('./extend.ts')
  await extend.default(dataset)
}

export const indexLines = async function (dataset: Dataset) {
  await mongo.connect(true)
  const indexLines = await import('./index-lines.ts')
  await indexLines.default(dataset)
}

export const validateFile = async function (dataset: FileDataset) {
  await mongo.connect(true)
  const validateFile = await import('./validate-file.ts')
  await validateFile.default(dataset)
}

export const exportRest = async function (dataset: RestDataset) {
  await mongo.connect(true)
  const exportRest = await import('./export-rest.ts')
  await exportRest.default(dataset)
}
