/**
 * The fragment cache behind the platform document: conditional GETs, the last good fragment kept
 * through failures, services that never answered listed as errors, and the per-site origin.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const { createFragmentCache, platformServices, siteOrigin } = await import('../../../api/src/platform-api-docs/service.ts')
const { mergePlatformDoc } = await import('../../../api/contract/platform-api-docs.ts')

const sdService = { id: 'sd', title: 'Simple Directory', mountPath: '/simple-directory', docPath: '/simple-directory/api/api-docs.json' } as const
const sdUrl = 'http://sd.internal/api/api-docs.json'

const sdDoc = {
  openapi: '3.0.0',
  paths: { '/api/users': { get: { operationId: 'listUsers', security: [], responses: { 200: { description: 'ok' } } } } }
}

type Answer = { status: number, body?: string, etag?: string } | 'network'

/** a fetch answering from a queue, recording the request headers */
const stubFetch = (answers: Answer[]) => {
  const requests: { url: string, headers: Record<string, string> }[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) })
    const answer = answers.shift()
    if (!answer) throw new Error('no answer left')
    if (answer === 'network') throw new TypeError('fetch failed')
    return new Response(answer.status === 304 ? null : answer.body ?? '', {
      status: answer.status,
      headers: answer.etag ? { etag: answer.etag } : {}
    })
  }) as typeof fetch
  return { fetchFn, requests }
}

let clock = 0
const now = () => new Date(Date.UTC(2026, 9, 19, 12, 0, clock++))

const sdCache = (answers: Answer[]) => {
  const { fetchFn, requests } = stubFetch(answers)
  const cache = createFragmentCache({ services: [{ service: sdService, url: sdUrl }], local: () => undefined, fetch: fetchFn, now })
  return { cache, requests, sd: () => cache.states()[0] }
}

test.describe('platform document fragment cache', () => {
  test('a 304 keeps the prepared fragment', async () => {
    const { cache, requests, sd } = sdCache([{ status: 200, body: JSON.stringify(sdDoc), etag: 'W/"1"' }, { status: 304 }])
    await cache.refresh()
    const first = sd()
    assert.equal(first.status, 'ok')
    assert.ok(first.fragment?.paths['/simple-directory/api/users'])
    await cache.refresh()
    assert.equal(requests[1].headers['if-none-match'], 'W/"1"')
    assert.equal(sd().status, 'ok')
    assert.equal(sd().fragment, first.fragment)
    assert.ok(sd().fetchedAt! > first.fetchedAt!, 'a 304 refreshes fetchedAt')
  })

  test('a failure after a success is stale and keeps the fragment', async () => {
    const { cache, sd } = sdCache([
      { status: 200, body: JSON.stringify(sdDoc), etag: 'W/"1"' },
      { status: 502, body: 'bad gateway' },
      'network',
      { status: 200, body: 'not json' }
    ])
    await cache.refresh()
    const fragment = sd().fragment
    for (let i = 0; i < 3; i++) {
      await cache.refresh()
      assert.equal(sd().status, 'stale')
      assert.ok(sd().error)
      assert.equal(sd().fragment, fragment)
    }
  })

  test('a service that never answered is error and absent from paths', async () => {
    const { cache, sd } = sdCache(['network'])
    await cache.refresh()
    assert.equal(sd().status, 'error')
    assert.ok(sd().error)
    assert.equal(sd().fragment, undefined)
    const doc = mergePlatformDoc('https://site.test', cache.states(), { version: '1', oauth2Description: '' })
    assert.deepEqual(Object.keys(doc.paths), [])
    assert.equal(doc['x-platform'].services[0].status, 'error')
  })

  test('a later success adds it', async () => {
    const { cache, sd } = sdCache([{ status: 500 }, { status: 200, body: JSON.stringify(sdDoc) }])
    await cache.refresh()
    assert.equal(sd().status, 'error')
    await cache.refresh()
    assert.equal(sd().status, 'ok')
    assert.equal(sd().error, undefined)
    const doc = mergePlatformDoc('https://site.test', cache.states(), { version: '1', oauth2Description: '' })
    assert.ok(doc.paths['/simple-directory/api/users'])
  })

  test('a refused document is refused with no fragment, even after a good one', async () => {
    const refused = { ...sdDoc, components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'query', name: 'key' } } } }
    const { cache, sd } = sdCache([{ status: 200, body: JSON.stringify(sdDoc) }, { status: 200, body: JSON.stringify(refused) }])
    await cache.refresh()
    await cache.refresh()
    assert.equal(sd().status, 'refused')
    assert.match(sd().error!, /apiKey/)
    assert.equal(sd().fragment, undefined)
  })

  test('the in-process document is prepared without fetching', async () => {
    const datafair = { id: 'datafair', title: 'Data Fair', mountPath: '/data-fair/api/v1', docPath: '/data-fair/api/v1/api-docs.json' } as const
    const fetchFn = (async () => { throw new Error('no fetch for the local document') }) as typeof fetch
    const cache = createFragmentCache({ services: [{ service: datafair }], local: () => ({ openapi: '3.1.0', paths: { '/ping': { get: { responses: {} } } } }), fetch: fetchFn, now })
    await cache.refresh()
    assert.equal(cache.states()[0].status, 'ok')
    assert.ok(cache.states()[0].fragment?.paths['/data-fair/api/v1/ping'])
  })

  test('the site origin of another site puts the token URL on that site', () => {
    const origin = siteOrigin('https://other.test/data-fair', 'https://main.test/data-fair')
    assert.equal(origin, 'https://other.test')
    assert.equal(siteOrigin('https://main.test/data-fair', 'https://main.test/data-fair'), 'https://main.test')
    const doc = mergePlatformDoc(origin, [], { version: '1', oauth2Description: '' })
    assert.equal(doc.components.securitySchemes.oauth2.flows.clientCredentials.tokenUrl, 'https://other.test/simple-directory/api/auth/nhi-token')
    assert.equal(doc.servers[0].url, 'https://other.test')
  })

  test('platformServices', () => {
    const services = platformServices({ publicUrl: 'https://main.test/data-fair', directoryUrl: 'https://main.test/simple-directory', privateDirectoryUrl: null, privateMetricsUrl: null })
    assert.deepEqual(services.map(s => s.service.id), ['datafair', 'sd'])
    assert.equal(services[0].url, undefined)
    assert.equal(services[0].service.mountPath, '/data-fair/api/v1')
    assert.equal(services[0].service.docPath, '/data-fair/api/v1/api-docs.json')
    assert.equal(services[1].url, 'https://main.test/simple-directory/api/api-docs.json')
    assert.equal(services[1].service.mountPath, '/simple-directory')

    const internal = platformServices({ publicUrl: 'https://main.test/data-fair', directoryUrl: 'https://main.test/simple-directory', privateDirectoryUrl: 'http://sd:8080', privateMetricsUrl: 'http://metrics:8080' })
    assert.deepEqual(internal.map(s => s.service.id), ['datafair', 'sd', 'metrics'])
    assert.equal(internal[1].url, 'http://sd:8080/api/api-docs.json')
    assert.equal(internal[2].url, 'http://metrics:8080/api/api-docs.json')
    assert.equal(internal[2].service.mountPath, '/metrics/api')
    assert.equal(internal[2].service.docPath, '/metrics/api/api-docs.json')
  })
})
