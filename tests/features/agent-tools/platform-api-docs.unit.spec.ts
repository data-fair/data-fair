/**
 * The platform document: service fragments rewritten into their namespace, checked for security
 * declarations that could widen what a scoped token reaches, and merged into one site document.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { prepareFragment, mergePlatformDoc, type PlatformService, type PreparedFragment } from '../../../api/contract/platform-api-docs.ts'

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
      { service: metrics, status: 'error', error: 'connection refused' }
    ], { version: '1.0.0', oauth2Description: 'tokens' })

    assert.equal(doc.openapi, '3.1.0')
    assert.equal(doc.info.title, 'API de la plateforme Data Fair')
    assert.deepEqual(doc.servers, [{ url: 'https://site.test' }])
    assert.deepEqual(doc['x-platform'].services.map((s: any) => s.status), ['ok', 'stale', 'error'])
    assert.deepEqual(doc['x-platform'].services[2], { id: 'metrics', status: 'error', error: 'connection refused' })
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
  })
})
