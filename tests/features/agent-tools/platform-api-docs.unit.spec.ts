/**
 * The platform document: service fragments rewritten into their namespace, checked for security
 * declarations that could widen what a scoped token reaches, and merged into one site document.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { snakeCase as openapiMcpSnakeCase } from '@data-fair/openapi-mcp'
import { prepareFragment, mergePlatformDoc, snakeCase, type PlatformService, type PreparedFragment } from '../../../api/contract/platform-api-docs.ts'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const sd: PlatformService = { id: 'sd', title: 'Simple Directory', mountPath: '/simple-directory', docPath: '/simple-directory/api/api-docs.json' }
const metrics: PlatformService = { id: 'metrics', title: 'Metrics', mountPath: '/metrics/api', docPath: '/metrics/api/api-docs.json' }
const datafair: PlatformService = { id: 'datafair', title: 'Data Fair', mountPath: '/data-fair/api/v1', docPath: '/data-fair/api/v1/api-docs.json' }

const ok200 = { 200: { description: 'ok' } }

const prepared = (service: PlatformService, doc: any): PreparedFragment => {
  const result = prepareFragment(service, doc)
  assert.ok('fragment' in result, 'refused' in result ? result.refused : '')
  return result.fragment
}

const refusal = (doc: any): string => {
  const result = prepareFragment(sd, doc)
  assert.ok('refused' in result, 'expected a refusal')
  return result.refused
}

/** every $ref of a document, with where it was found */
const refsOf = (value: any, at = '#'): { at: string, ref: string }[] => {
  if (Array.isArray(value)) return value.flatMap((item, i) => refsOf(item, `${at}/${i}`))
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => key === '$ref' && typeof child === 'string' ? [{ at, ref: child }] : refsOf(child, `${at}/${key}`))
}

const resolves = (doc: any, ref: string) => {
  let target = doc
  for (const segment of ref.slice(2).split('/')) {
    target = target?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')]
    if (target === undefined) return false
  }
  return true
}

const agentNamesOf = (doc: any): string[] => Object.values(doc.paths).flatMap((item: any) => Object.values(item))
  .flatMap((op: any) => op?.['x-agent'] === undefined ? [] : [op['x-agent']].flat().map((entry: any) => entry.name))

const oauth2 = (flows: any = { clientCredentials: { tokenUrl: '/token', scopes: { 'things:read': 'Read things' } } }) => ({ type: 'oauth2', flows })

test.describe('platform api docs', () => {
  test('namespaces paths, operationIds, components and refs', () => {
    const fragment = prepared(sd, {
      openapi: '3.1.0',
      paths: {
        '/items': {
          get: {
            operationId: 'listItems',
            parameters: [{ $ref: '#/components/parameters/q' }],
            responses: {
              200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/item' } } } },
              404: { $ref: '#/components/responses/NotFound' }
            }
          }
        }
      },
      components: {
        schemas: { item: { type: 'object', properties: { child: { $ref: '#/components/schemas/item' } } } },
        responses: { NotFound: { description: 'not found' } },
        parameters: { q: { name: 'q', in: 'query', schema: { type: 'string' } } }
      }
    })
    assert.deepEqual(Object.keys(fragment.paths), ['/simple-directory/items'])
    const op = fragment.paths['/simple-directory/items'].get
    assert.equal(op.operationId, 'sd_listItems')
    assert.equal(op.parameters[0].$ref, '#/components/parameters/sd_q')
    assert.equal(op.responses[200].content['application/json'].schema.$ref, '#/components/schemas/sd_item')
    assert.equal(op.responses[404].$ref, '#/components/responses/sd_NotFound')
    assert.ok(fragment.components.schemas.sd_item)
    assert.equal(fragment.components.schemas.sd_item.properties.child.$ref, '#/components/schemas/sd_item')
    assert.ok(fragment.components.responses.sd_NotFound)
    assert.ok(fragment.components.parameters.sd_q)
    assert.equal(fragment.components.securitySchemes, undefined)
  })

  test('objects shared between operations are rewritten once', () => {
    const notFound = { $ref: '#/components/responses/NotFound' }
    const xAgent = { description: 'shared' }
    const fragment = prepared(sd, {
      openapi: '3.1.0',
      components: { responses: { NotFound: { description: 'not found' } } },
      paths: {
        '/a': { get: { operationId: 'getA', 'x-agent': xAgent, responses: { 404: notFound } } },
        '/b': { get: { operationId: 'getB', 'x-agent': xAgent, responses: { 404: notFound } } }
      }
    })
    assert.equal(fragment.paths['/simple-directory/a'].get.responses[404].$ref, '#/components/responses/sd_NotFound')
    assert.equal(fragment.paths['/simple-directory/b'].get.responses[404].$ref, '#/components/responses/sd_NotFound')
    assert.equal(fragment.paths['/simple-directory/a'].get['x-agent'].name, 'sd_get_a')
    assert.equal(fragment.paths['/simple-directory/b'].get['x-agent'].name, 'sd_get_b')
    assert.equal(notFound.$ref, '#/components/responses/NotFound', 'the source document is not mutated')
  })

  test('snakeCase matches openapi-mcp', () => {
    for (const name of ['listItems', 'opX', 'getDatasetLines', 'patch_application', 'API-docs.json', 'x2Y']) {
      assert.equal(snakeCase(name), openapiMcpSnakeCase(name))
    }
  })

  test('servers below the root are removed', () => {
    const fragment = prepared(sd, {
      openapi: '3.1.0',
      servers: [{ url: 'http://simple-directory:8080' }],
      paths: { '/a': { servers: [{ url: 'http://private' }], get: { operationId: 'a', servers: [{ url: 'http://private' }], responses: ok200 } } }
    })
    assert.equal(fragment.paths['/simple-directory/a'].servers, undefined)
    assert.equal(fragment.paths['/simple-directory/a'].get.servers, undefined)
  })

  test('x-agent on an operation without operationId is reported', () => {
    const fragment = prepared(sd, { openapi: '3.1.0', paths: { '/a': { get: { 'x-agent': { name: 'a' }, responses: ok200 } } } })
    assert.deepEqual(fragment.warnings, ['x-agent on GET /a that has no operationId'])
    assert.equal(fragment.paths['/simple-directory/a'].get['x-agent'].name, 'sd_a')
  })

  test('names every x-agent entry', () => {
    const fragment = prepared(sd, {
      openapi: '3.1.0',
      paths: {
        '/x': { get: { operationId: 'opX', 'x-agent': [{ name: 'a', profiles: ['x'] }, {}], responses: ok200 } },
        '/y': { get: { operationId: 'getY', 'x-agent': { description: 'y' }, responses: ok200 } }
      }
    })
    assert.deepEqual(fragment.paths['/simple-directory/x'].get['x-agent'], [{ name: 'sd_a' }, { name: 'sd_op_x' }])
    assert.deepEqual(fragment.paths['/simple-directory/y'].get['x-agent'], { name: 'sd_get_y', description: 'y' })
  })

  test('skills', () => {
    const fragment = prepared(metrics, {
      openapi: '3.1.0',
      'x-agent': { namePrefix: 'metrics', skills: [{ name: 'review', description: 'Review', href: 'agents/skills/review.md', tools: ['a'] }] },
      paths: {}
    })
    assert.deepEqual(fragment.skills, [{ name: 'metrics-review', description: 'Review', href: 'agents/skills/review.md', tools: ['metrics_a'] }])
    const doc = mergePlatformDoc('https://site.test', [{ service: metrics, fragment, status: 'ok' }], { version: '1.0.0', oauth2Description: 'tokens' })
    assert.deepEqual(doc['x-agent'].skills, [{
      name: 'metrics-review',
      description: 'Review',
      href: 'https://site.test/metrics/api/agents/skills/review.md',
      tools: ['metrics_a']
    }])
  })

  test('security', () => {
    const withRoot = prepared(sd, {
      openapi: '3.1.0',
      security: [{ apiKey: [] }],
      components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-apiKey', description: 'a key' } } },
      paths: {
        '/public': { get: { operationId: 'pub', security: [], responses: ok200 } },
        '/default': { get: { operationId: 'def', responses: ok200 } }
      }
    })
    assert.deepEqual(withRoot.paths['/simple-directory/public'].get.security, [])
    assert.deepEqual(withRoot.paths['/simple-directory/default'].get.security, [{ apiKey: [] }])

    // a scheme the merged document does not carry: its alternatives go, failing closed when none is left
    const withBearer = prepared(sd, {
      openapi: '3.1.0',
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
      paths: {
        '/only': { get: { operationId: 'only', security: [{ bearer: [] }], responses: ok200 } },
        '/either': { get: { operationId: 'either', security: [{ bearer: [] }, { apiKey: [] }], responses: ok200 } },
        '/both': { get: { operationId: 'both', security: [{ bearer: [], apiKey: [] }, {}], responses: ok200 } }
      }
    })
    assert.deepEqual(withBearer.paths['/simple-directory/only'].get.security, [{ sdCookie: [] }])
    assert.deepEqual(withBearer.paths['/simple-directory/either'].get.security, [{ apiKey: [] }])
    assert.deepEqual(withBearer.paths['/simple-directory/both'].get.security, [{}])
    assert.equal(withBearer.warnings.length, 1)
    assert.match(withBearer.warnings[0], /bearer/)

    const withoutAny = prepared(sd, { openapi: '3.1.0', paths: { '/a': { get: { operationId: 'a', responses: ok200 } } } })
    assert.deepEqual(withoutAny.paths['/simple-directory/a'].get.security, [{ sdCookie: [] }])
  })

  test('refusals', () => {
    assert.match(refusal({ openapi: '3.1.0', paths: {}, components: { securitySchemes: { oidc: oauth2() } } }), /oidc/)
    assert.match(refusal({ openapi: '3.1.0', paths: {}, components: { securitySchemes: { oauth2: oauth2({ authorizationCode: { authorizationUrl: '/a', tokenUrl: '/t', scopes: {} } }) } } }), /clientCredentials/)
    assert.match(refusal({
      openapi: '3.1.0',
      components: { securitySchemes: { oauth2: oauth2() } },
      paths: { '/a': { get: { operationId: 'a', security: [{ oauth2: ['things:write'] }], responses: ok200 } } }
    }), /scope/)
    assert.match(refusal({ openapi: '3.1.0', paths: {}, components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-other' } } } }), /apiKey/)
    assert.match(refusal({
      openapi: '3.1.0',
      paths: {
        '/a': { get: { operationId: 'dup', responses: ok200 } },
        '/b': { post: { operationId: 'dup', 'x-agent': {}, responses: ok200 } }
      }
    }), /duplicate/)
    assert.match(refusal({ openapi: '2.0', paths: {} }), /OpenAPI/)
    assert.match(refusal({ openapi: '3.1.0', paths: {}, components: { securitySchemes: { oauth2: oauth2({ clientCredentials: null }) } } }), /clientCredentials/)
    // a scheme the fragment does not declare would bind to the merged scheme of that name
    assert.match(refusal({ openapi: '3.1.0', paths: { '/a': { get: { operationId: 'a', security: [{ oauth2: [] }], responses: ok200 } } } }), /oauth2/)
    assert.match(refusal({ openapi: '3.1.0', paths: { '/a': { get: { operationId: 'a', security: [{ bearer: [] }], responses: ok200 } } } }), /bearer/)
    assert.match(refusal({
      openapi: '3.1.0',
      components: { securitySchemes: { oauth2: oauth2() } },
      paths: { '/a': { get: { operationId: 'a', security: [{ oauth2: ['constructor'] }], responses: ok200 } } }
    }), /constructor/)
    assert.match(refusal({
      openapi: '3.1.0',
      components: { securitySchemes: { oauth2: oauth2() } },
      paths: { '/a': { patch: { operationId: 'a', security: [{ oauth2: ['things:read'] }], 'x-agent': [{}, { security: [{ oauth2: ['things:admin'] }] }], responses: ok200 } } }
    }), /things:admin/)

    const duplicate = prepared(sd, {
      openapi: '3.1.0',
      paths: {
        '/a': { get: { operationId: 'dup', responses: ok200 } },
        '/b': { post: { operationId: 'dup', responses: ok200 } }
      }
    })
    assert.deepEqual(duplicate.warnings, ['duplicate operationId dup on POST /b'])
    assert.equal(duplicate.paths['/simple-directory/a'].get.operationId, 'sd_dup')
    assert.equal(duplicate.paths['/simple-directory/b'].post.operationId, undefined)
  })

  test('accepts OpenAPI 3.0.0', () => {
    const fragment = prepared(sd, {
      openapi: '3.0.0',
      components: { securitySchemes: { oauth2: oauth2() } },
      paths: { '/a': { get: { operationId: 'a', security: [{ oauth2: ['things:read'] }], responses: ok200 } } }
    })
    assert.deepEqual(fragment.scopes, { 'things:read': 'Read things' })
  })

  test('merge', async () => {
    const datafairFragment = prepared(datafair, {
      openapi: '3.1.0',
      tags: [{ name: 'Datasets' }],
      components: {
        schemas: { dataset: { type: 'object' } },
        securitySchemes: { oauth2: oauth2({ clientCredentials: { tokenUrl: '/t', scopes: { 'datasets:read': 'Read datasets' } } }) }
      },
      paths: {
        '/datasets': {
          get: {
            operationId: 'listDatasets',
            tags: ['Datasets'],
            security: [{ apiKey: [] }, { oauth2: ['datasets:read'] }],
            responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/dataset' } } } } }
          }
        }
      }
    })
    const sdFragment = prepared(sd, {
      openapi: '3.0.0',
      components: { securitySchemes: { oauth2: oauth2() } },
      paths: { '/api/things': { get: { operationId: 'things', security: [{ oauth2: ['things:read'] }], responses: ok200 } } }
    })
    const doc = mergePlatformDoc('https://site.test', [
      { service: datafair, fragment: datafairFragment, status: 'ok', fetchedAt: '2026-10-19T00:00:00.000Z' },
      { service: sd, fragment: sdFragment, status: 'stale', error: 'timeout' },
      { service: metrics, status: 'error', error: 'connection refused' },
      { service: { ...metrics, id: 'metrics' }, status: 'refused', error: 'oauth2 flows must be clientCredentials only' }
    ], { version: '1.0.0', oauth2Description: 'tokens' })

    assert.equal(doc.openapi, '3.1.0')
    assert.equal(doc.info.title, 'API de la plateforme Data Fair')
    assert.deepEqual(doc.servers, [{ url: 'https://site.test' }])
    assert.deepEqual(doc['x-platform'].services.map((s: any) => s.status), ['ok', 'stale', 'error', 'refused'])
    assert.deepEqual(doc['x-platform'].services[2], { id: 'metrics', status: 'error', error: 'connection refused' })
    assert.deepEqual(doc['x-platform'].services[3], { id: 'metrics', status: 'refused', error: 'oauth2 flows must be clientCredentials only' })
    assert.equal(doc.components.securitySchemes.oauth2.flows.clientCredentials.tokenUrl, 'https://site.test/simple-directory/api/auth/nhi-token')
    assert.deepEqual(doc.components.securitySchemes.oauth2.flows.clientCredentials.scopes, { 'datasets:read': 'Read datasets', 'things:read': 'Read things' })
    assert.deepEqual(doc.components.securitySchemes.apiKey, { type: 'apiKey', in: 'header', name: 'x-apiKey' })
    assert.equal(doc.security, undefined)
    assert.deepEqual(doc.tags, [{ name: 'Data Fair / Datasets' }])
    assert.deepEqual(Object.keys(doc.paths), ['/data-fair/api/v1/datasets', '/simple-directory/api/things'])
    assert.ok(doc.components.schemas.datafair_dataset)

    const { compile } = await import('../../../api/src/misc/utils/ajv.ts')
    compile('openapi-3.1')(doc)
  })

  test('a path claimed by two services stays with the first', () => {
    const first = prepared(sd, { openapi: '3.1.0', paths: { '/a': { get: { operationId: 'first', responses: ok200 } } } })
    const second = prepared({ ...metrics, mountPath: '/simple-directory' }, { openapi: '3.1.0', paths: { '/a': { get: { operationId: 'second', responses: ok200 } } } })
    const doc = mergePlatformDoc('https://site.test', [
      { service: sd, fragment: first, status: 'ok' },
      { service: metrics, fragment: second, status: 'ok' }
    ], { version: '1.0.0', oauth2Description: 'tokens' })
    assert.equal(doc.paths['/simple-directory/a'].get.operationId, 'sd_first')
    assert.equal(doc['x-platform'].services[0].warnings, undefined)
    assert.deepEqual(doc['x-platform'].services[1].warnings, ['path /simple-directory/a is already provided by sd'])
  })

  test('the data-fair document prepares without warnings', async () => {
    const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
    const result = prepareFragment(datafair, apiDocs('https://example.test/data-fair'))
    assert.ok('fragment' in result, 'refused' in result ? result.refused : '')
    assert.deepEqual(result.fragment.warnings, [])
    assert.deepEqual(result.fragment.skills.map(s => s.name), ['datafair-workflow'])
    assert.ok(Object.keys(result.fragment.scopes).includes('datasets:read'))

    const doc = mergePlatformDoc('https://example.test', [{ service: datafair, fragment: result.fragment, status: 'ok' }], { version: '1.0.0', oauth2Description: 'tokens' })
    const { compile } = await import('../../../api/src/misc/utils/ajv.ts')
    compile('openapi-3.1')(doc)

    const refs = refsOf(doc).filter(({ ref }) => ref.startsWith('#/'))
    assert.ok(refs.length > 100)
    assert.deepEqual(refs.filter(({ ref }) => !resolves(doc, ref)), [])
    const names = agentNamesOf(doc)
    assert.ok(names.length > 10)
    assert.deepEqual(names.filter(name => !/^datafair_/.test(name) || /^datafair_datafair_/.test(name)), [])
    for (const op of Object.values(doc.paths).flatMap((item: any) => Object.values(item)) as any[]) {
      for (const requirement of op?.security ?? []) {
        for (const scheme of Object.keys(requirement)) assert.ok(doc.components.securitySchemes[scheme], scheme)
      }
    }
  })
})
