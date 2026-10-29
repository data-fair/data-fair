import mongo from '#mongo'
import { resourceTask, threadInit } from '../log-context.ts'
import type { FileDataset } from '#types'
import config from '#config'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'

// per-thread resources, created outside the log context of the first task (see ../log-context.ts)
const init = threadInit(async () => {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  await Promise.all([import('./analyze-csv.ts'), import('./analyze-geojson.ts'), import('./normalize.ts')])
})

export const analyzeCsv = resourceTask(async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  const analyzeCsv = await import('./analyze-csv.ts')
  await analyzeCsv.default(dataset)
}, init)

export const analyzeGeojson = resourceTask(async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const analyzeGeojson = await import('./analyze-geojson.ts')
  await analyzeGeojson.default(dataset)
}, init)

export const normalizeFile = resourceTask(async function (dataset: FileDataset) {
  await mongo.connect(true)
  await wsEmitter.init(mongo.db)
  const normalize = await import('./normalize.ts')
  await normalize.default(dataset)
}, init)

export const setEnv = function ({ key, value }: { key: string, value: string | undefined }) {
  process.env[key] = value
}

export const setConfig = function ({ key, value }: { key: string, value: any }) {
  config[key] = value
}
