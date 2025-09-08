import mongo from '#mongo'
import es from '#es'
import config from '#config'
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
    headers?: Record<string, string>
    body: any
  }
}

export const setNock = async function (nockInfo: NockInfo) {
  const nock = (await import('nock')).default
  nock(nockInfo.origin)[nockInfo.method ?? 'get'](nockInfo.path).reply(nockInfo.reply.status, nockInfo.reply.body, nockInfo.reply.headers)
}

export const setCoordsNock = async function (params: { nbInputs: number, latLon?: number, query?: string, multiply?: boolean, error?: string }) {
  const nock = (await import('nock')).default
  const assert = (await import('node:assert'))

  nock('http://test.com').post('/geocoder/coords' + (params.query ?? '')).reply(200, (uri: string, requestBody: string) => {
    const inputs = requestBody.trim().split('\n').map(line => JSON.parse(line))
    assert.equal(inputs.length, params.nbInputs)
    assert.deepEqual(Object.keys(inputs[0]), ['q', 'key'])
    return inputs
      .map((input, i) => {
        if (params.error) return { key: input.key, error: params.error }
        let latLon = params.latLon ?? 10
        if (params.multiply) latLon = latLon * i
        return { key: input.key, lat: latLon, lon: latLon, matchLevel: 'match' + i }
      })
      .map(line => JSON.stringify(line)).join('\n') + '\n'
  })
}

export const setSireneNock = async function () {
  const nock = (await import('nock')).default
  const assert = (await import('node:assert'))
  nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
  // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
    .post('/sirene/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon')
  // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
    .reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 1)
      assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
      return JSON.stringify({
        NOMEN_LONG: 'KOUMOUL',
        'location.lon': '-2.748514',
        'location.lat': '47.687173',
        key: inputs[0].key
      }) + '\n'
    })
}

export const setSireneNock2 = async function () {
  const nock = (await import('nock')).default
  const assert = (await import('node:assert'))
  nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
  // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
    .post('/sirene/etablissements_bulk?select=siret,NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon')
  // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
    .reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 1)
      assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
      return JSON.stringify({
        siret: '82898347800011',
        NOMEN_LONG: 'KOUMOUL',
        'location.lon': '-2.748514',
        'location.lat': '47.687173',
        key: inputs[0].key
      }) + '\n'
    })
}

export const setSireneNock3 = async function () {
  const nock = (await import('nock')).default
  const assert = (await import('node:assert'))
  nock('http://test.com', { reqheaders: { 'x-apiKey': config.defaultRemoteKey.value } })
  // /sirene/api/v1/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET%2Clocation.lat%2Clocation.lon'
    .post('/sirene/etablissements_bulk?select=NOMEN_LONG%2Cbodacc.capital%2CTEFET')
  // .query({ params: { select: 'NOMEN_LONG,bodacc.capital,TEFET,location.lat,location.lon' } })
    .reply(200, (uri, requestBody) => {
      const inputs = requestBody.trim().split('\n').map(JSON.parse)
      assert.equal(inputs.length, 1)
      assert.deepEqual(Object.keys(inputs[0]), ['siret', 'key'])
      return JSON.stringify({
        NOMEN_LONG: 'KOUMOUL',
        key: inputs[0].key
      }) + '\n'
    })
}

export const setEnv = function ({ key, value }: { key: string, value: string | undefined }) {
  process.env[key] = value
}
