import mongo from '#mongo'
import type { FileDataset } from '#types'

export const analyzeCsv = async function (dataset: FileDataset) {
  await mongo.connect(true)
  const analyzeCsv = await import('./analyze-csv.ts')
  await analyzeCsv.default(dataset)
}

export const analyzeGeojson = async function (dataset: FileDataset) {
  await mongo.connect(true)
  const analyzeGeojson = await import('./analyze-geojson.ts')
  await analyzeGeojson.default(dataset)
}

export const normalize = async function (dataset: FileDataset) {
  await mongo.connect(true)
  const normalize = await import('./normalize.ts')
  await normalize.default(dataset)
}
