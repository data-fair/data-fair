import mongo from '#mongo'
import type { FileDataset } from '#types'
import config from '#config'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'

export const analyzeCsv = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const analyzeCsv = await import('./analyze-csv.ts')
  await analyzeCsv.default(dataset)
}

export const analyzeGeojson = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const analyzeGeojson = await import('./analyze-geojson.ts')
  await analyzeGeojson.default(dataset)
}

export const normalizeFile = async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const normalize = await import('./normalize.ts')
  await normalize.default(dataset)
}

export const setEnv = function ({ key, value }: { key: string, value: string | undefined }) {
  process.env[key] = value
}

export const setConfig = function ({ key, value }: { key: string, value: any }) {
  config[key] = value
}
