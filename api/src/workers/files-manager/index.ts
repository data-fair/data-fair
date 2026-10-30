import mongo from '#mongo'
import { resourceTask, threadInit } from '../log-context.ts'
import es from '#es'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { Dataset } from '#types'
import type { NockInfo } from '../batch-processor/index.ts'

// per-thread resources, created outside the log context of the first task (see ../log-context.ts)
const init = threadInit(async () => {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  await Promise.all([import('./initialize.ts'), import('./store-file.ts')])
})

export const initialize = resourceTask(async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
  const initialize = await import('./initialize.ts')
  await initialize.default(dataset)
}, init)

export const storeFile = resourceTask(async function (dataset: Dataset) {
  await mongo.connect(true)
  const storeFile = await import('./store-file.ts')
  await storeFile.default(dataset)
}, init)

export const setNock = async function (nockInfo: NockInfo) {
  const nock = (await import('nock')).default
  nock(nockInfo.origin)[nockInfo.method ?? 'get'](nockInfo.path).reply(nockInfo.reply.status, nockInfo.reply.body, nockInfo.reply.headers)
}
