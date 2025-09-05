import mongo from '#mongo'
import es from '#es'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { FileDataset, RestDataset, Dataset } from '#types'

export const extend = async function (dataset: Dataset) {
  await Promise.all([mongo.connect(true), es.connect()])
  await wsEmitter.init(mongo.db)
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

export type NockInfo = {
  origin: string
  method?: 'post' | 'get',
  path: string,
  reply: {
    status?: number,
    body: any
  }
}

export const setNock = async function (nockInfo: NockInfo) {
  const nock = (await import('nock')).default
  const assert = (await import('node:assert'))
  let body = nockInfo.reply.body
  if (body === '_coords') {
    body = (uri: string, requestBody: string) => {
      const inputs = requestBody.trim().split('\n').map(line => JSON.parse(line))
      assert.equal(inputs.length, 2)
      assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
      return inputs.map(input => ({ key: input.key, lat: 10, lon: 10 }))
        .map(line => JSON.stringify(line)).join('\n') + '\n'
    }
  }
  nock(nockInfo.origin)[nockInfo.method ?? 'get'](nockInfo.path).reply(nockInfo.reply.status, body)
}
