import mongo from '#mongo'
import es from '#es'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { Dataset } from '#types'
import type { NockInfo } from '../batch-processor/index.ts'

export const initialize = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
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

export const setNock = async function (nockInfo: NockInfo) {
  const nock = (await import('nock')).default
  nock(nockInfo.origin)[nockInfo.method ?? 'get'](nockInfo.path).reply(nockInfo.reply.status, nockInfo.reply.body)
}
