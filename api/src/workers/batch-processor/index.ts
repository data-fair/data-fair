import mongo from '#mongo'
import es from '#es'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { FileDataset, RestDataset, Dataset } from '#types'

export const extend = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  const extend = await import('./extend.ts')
  await extend.default(dataset)
}

export const indexLines = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  const indexLines = await import('./index-lines.ts')
  await indexLines.default(dataset)
}

export const validateFile = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const validateFile = await import('./validate-file.ts')
  await validateFile.default(dataset)
}

export const exportRest = async function (dataset: RestDataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  const exportRest = await import('./export-rest.ts')
  await exportRest.default(dataset)
}
