/**
 * The platform document: service fragments rewritten into their namespace, checked for security
 * declarations that could widen what a scoped token reaches, and merged into one site document.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { snakeCase as openapiMcpSnakeCase, validateVocabulary, load, toolsForScopes } from '@data-fair/openapi-mcp'
import { prepareFragment, mergePlatformDoc, snakeCase, agentEntryKeys, agentTagKeys, agentSkillKeys, type PlatformService, type PreparedFragment } from '../../../api/contract/platform-api-docs.ts'

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
    assert.deepEqual(fragment.warnings, ['GET /x: x-agent profiles not part of the platform vocabulary, removed'])
  })

  test('x-agent keys outside the vocabulary are removed, never passed to openapi-mcp', () => {
    const fragment = prepared(metrics, {
      openapi: '3.1.0',
      'x-agent': {
        namePrefix: 'metrics',
        profiles: { x: {} },
        skills: [
          { name: 'review', description: 'Review', href: 'review.md', profiles: ['x'] },
          { name: 'Bad Name', description: 'x' },
          { name: 'both', description: 'x', href: 'a.md', body: 'b' },
          { name: 'long', description: 'x'.repeat(1025) },
          'not an object'
        ]
      },
      tags: [
        { name: 'A', 'x-agent': { skill: 'Use A', profiles: ['x'] } },
        { name: 'B', 'x-agent': { skill: 3 } },
        { name: 'C', 'x-agent': 'nope' }
      ],
      paths: { '/x': { get: { operationId: 'x', 'x-agent': { namePrefix: 'm', response: { rows: '/results' } }, responses: ok200 } } }
    })
    assert.deepEqual(fragment.skills, [{ name: 'metrics-review', description: 'Review', href: 'review.md' }])
    assert.deepEqual(fragment.tags, [
      { name: 'Metrics / A', 'x-agent': { skill: 'Use A' } },
      { name: 'Metrics / B' },
      { name: 'Metrics / C' }
    ])
    assert.deepEqual(fragment.paths['/metrics/api/x'].get['x-agent'], { name: 'metrics_x', response: { rows: '/results' } })
    assert.deepEqual(fragment.warnings, [
      'GET /x: x-agent namePrefix not part of the platform vocabulary, removed',
      'tag A: x-agent profiles not part of the platform vocabulary, removed',
      'tag B: x-agent skill is not a text, removed',
      'tag C: x-agent is not an object, removed',
      'skill review: x-agent profiles not part of the platform vocabulary, removed',
      'skill Bad Name removed: its name is not kebab-case (64 characters at most once namespaced)',
      'skill both removed: it has both href and body',
      'skill long removed: its description is not a text of 1024 characters at most',
      'a skill that is not an object, removed'
    ])
  })

  test('the vocabulary kept is one openapi-mcp accepts', () => {
    // a key of these lists that openapi-mcp no longer knows would come back as "additional property"
    const unknownIn = (doc: any) => {
      try {
        validateVocabulary(doc)
        return []
      } catch (err: any) {
        return [...err.message.matchAll(/\(([^)]+)\)/g)].map(match => match[1])
      }
    }
    const garbage = (keys: string[]) => Object.fromEntries(keys.map(key => [key, Symbol('not json')]))
    assert.deepEqual(unknownIn({ paths: { '/a': { get: { 'x-agent': garbage(agentEntryKeys) } } } }), [])
    assert.deepEqual(unknownIn({ tags: [{ name: 'a', 'x-agent': garbage(agentTagKeys) }] }), [])
    assert.deepEqual(unknownIn({ 'x-agent': { skills: [garbage(agentSkillKeys)] } }), [])
    assert.deepEqual(unknownIn({ paths: { '/a': { get: { 'x-agent': { profiles: [] } } } } }), ['profiles'])
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

    // a security that is not a list fails closed
    const notAList = prepared(sd, {
      openapi: '3.1.0',
      security: { apiKey: [] },
      paths: {
        '/root': { get: { operationId: 'root', responses: ok200 } },
        '/own': { get: { operationId: 'own', security: 'none', responses: ok200 } }
      }
    })
    assert.deepEqual(notAList.paths['/simple-directory/root'].get.security, [{ sdCookie: [] }])
    assert.deepEqual(notAList.paths['/simple-directory/own'].get.security, [{ sdCookie: [] }])
    assert.deepEqual(notAList.warnings, [
      'the root security is not a list of requirements, its operations require the cookie session',
      'GET /own: security is not a list of requirements, the cookie session is required'
    ])
  })

  test('an x-agent entry security only narrows the rewritten operation security', () => {
    const fragment = prepared(sd, {
      openapi: '3.1.0',
      'x-agent': { skills: [{ name: 'guide', description: 'Guide', body: 'Use them', tools: ['a', 'b', 'c', 'dropped2'] }] },
      components: { securitySchemes: { oauth2: oauth2(), bearer: { type: 'http', scheme: 'bearer' } } },
      paths: {
        // the entry's own alternative outside the operation's is removed, the rest kept
        '/narrow': {
          patch: {
            operationId: 'narrow',
            security: [{ apiKey: [] }, { oauth2: ['things:read'] }],
            'x-agent': [{ name: 'a' }, { name: 'b', security: [{ oauth2: ['things:read'] }, { sdCookie: [] }] }],
            responses: ok200
          }
        },
        // nothing of the entry is left: the entry goes, the operation's other entries stay
        '/gone': {
          patch: {
            operationId: 'gone',
            security: [{ apiKey: [] }],
            'x-agent': [{ name: 'a' }, { name: 'b', security: [{ sdCookie: [] }] }, { name: 'c', security: [] }],
            responses: ok200
          }
        },
        // the operation fell back on the cookie session (its only scheme dropped): the entry follows it
        '/dropped': { get: { operationId: 'dropped', security: [{ bearer: [] }], 'x-agent': { security: [{ bearer: [] }] }, responses: ok200 } },
        // an entry made only of dropped alternatives, on an operation keeping others, is removed
        '/dropped2': { get: { operationId: 'dropped2', security: [{ bearer: [] }, { apiKey: [] }], 'x-agent': { security: [{ bearer: [] }] }, responses: ok200 } },
        // public stays public
        '/public': { get: { operationId: 'pub', security: [], 'x-agent': { security: [] }, responses: ok200 } },
        '/bad': { get: { operationId: 'bad', 'x-agent': { security: 'x' }, responses: ok200 } }
      }
    })
    const op = (p: string) => Object.values(fragment.paths[`/simple-directory${p}`])[0] as any
    assert.deepEqual(op('/narrow')['x-agent'], [{ name: 'sd_a' }, { name: 'sd_b', security: [{ oauth2: ['things:read'] }] }])
    assert.deepEqual(op('/gone')['x-agent'], [{ name: 'sd_a' }])
    assert.deepEqual(op('/dropped').security, [{ sdCookie: [] }])
    assert.deepEqual(op('/dropped')['x-agent'], { name: 'sd_dropped', security: [{ sdCookie: [] }] })
    assert.equal(op('/dropped2')['x-agent'], undefined)
    assert.deepEqual(op('/public')['x-agent'], { name: 'sd_pub', security: [] })
    assert.equal(op('/bad')['x-agent'], undefined)
    // a skill no longer names the tool of a removed entry ('c', 'dropped2'), unless another
    // entry still provides that name ('b' stays on /narrow)
    assert.deepEqual(fragment.skills[0].tools, ['sd_a', 'sd_b'])
    assert.deepEqual(fragment.warnings.filter(w => !/bearer is not part/.test(w)), [
      'PATCH /narrow: x-agent security alternatives not in the operation\'s security removed: {"sdCookie":[]}',
      'PATCH /gone: x-agent security alternatives not in the operation\'s security removed: {"sdCookie":[]}',
      'PATCH /gone: x-agent entry b removed, none of its security is left within the operation\'s',
      'PATCH /gone: x-agent entry c removed, none of its security is left within the operation\'s',
      'GET /dropped2: x-agent security alternatives not in the operation\'s security removed: {"sdCookie":[]}',
      'GET /dropped2: x-agent entry removed, none of its security is left within the operation\'s',
      'GET /bad: x-agent entry with a security that is not a list, removed'
    ])
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

  test('a merged document of data-fair, a simple-directory-like and a metrics-like fragment loads in openapi-mcp', async () => {
    const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
    const datafairFragment = prepared(datafair, apiDocs('https://example.test/data-fair'))
    // simple-directory's shape: OpenAPI 3.0, schemas with their own $id pointing at other $ids
    // the document does not embed, and at $defs of their own resource
    const sdFragment = prepared(sd, {
      openapi: '3.0.0',
      components: { securitySchemes: { sdCookie: { type: 'apiKey', in: 'cookie', name: 'id_token' }, oauth2: oauth2({ clientCredentials: { tokenUrl: '/t', scopes: { 'organizations:read': 'Read organizations' } } }) } },
      tags: [{ name: 'Users' }],
      paths: {
        '/.well-known/jwks.json': { get: { responses: { 200: { description: 'keys', content: { 'application/json': { examples: [{ keys: [] }] } } } } } },
        '/api/auth/passwordless': { post: { operationId: 'authPasswordless', responses: ok200 } },
        '/api/auth/password': { post: { operationId: 'authPasswordless', responses: ok200 } },
        '/api/users/{id}': {
          get: {
            operationId: 'getUser',
            tags: ['Users'],
            security: [{ sdCookie: [] }, { oauth2: ['organizations:read'] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            responses: {
              200: {
                description: 'a user',
                content: {
                  'application/json': {
                    schema: {
                      $id: 'https://github.com/data-fair/simple-directory/user',
                      type: 'object',
                      properties: {
                        created: { allOf: [{ $ref: 'https://github.com/data-fair/simple-directory/partial#/$defs/modifier' }] },
                        sessions: { type: 'array', items: { $ref: '#/$defs/serverSession' } },
                        nickname: { type: 'string', nullable: true }
                      },
                      $defs: { serverSession: { type: 'object', properties: { id: { type: 'string' } } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
    // metrics' shape: a tool behind the cookie session or its own scope, a linked skill naming it
    const metricsFragment = prepared(metrics, {
      openapi: '3.1.0',
      'x-agent': { skills: [{ name: 'review', description: 'Review the audience', href: 'agents/skills/review.md', tools: ['aggregate_requests'] }] },
      components: { securitySchemes: { sdCookie: { type: 'apiKey', in: 'cookie', name: 'id_token' }, oauth2: oauth2({ clientCredentials: { tokenUrl: '/t', scopes: { 'metrics:read': 'Read metrics' } } }) } },
      security: [{ sdCookie: [] }],
      paths: {
        '/daily-api-metrics/_agg': {
          get: {
            operationId: 'aggDailyApiMetrics',
            security: [{ sdCookie: [] }, { oauth2: ['metrics:read'] }],
            'x-agent': { name: 'aggregate_requests', description: 'Count the requests over a period.' },
            parameters: [{ in: 'query', name: 'start', required: true, description: 'First day.', schema: { type: 'string', format: 'date' } }],
            responses: { 200: { description: 'rows', content: { 'application/json': { schema: { type: 'object' } } } } }
          }
        }
      }
    })
    const doc = mergePlatformDoc('https://example.test', [
      { service: datafair, fragment: datafairFragment, status: 'ok' },
      { service: sd, fragment: sdFragment, status: 'ok' },
      { service: metrics, fragment: metricsFragment, status: 'ok' }
    ], { version: '1.0.0', oauth2Description: 'tokens' })

    const warn = console.warn
    const warned: string[] = []
    console.warn = (message: string) => { warned.push(message) }
    let toolSet
    try {
      toolSet = await load(doc, { lint: 'error' })
    } finally {
      console.warn = warn
    }
    // the ref to a $id the document does not embed reads as any value; the one into the resource's own $defs resolves
    assert.equal(warned.length, 1)
    assert.match(warned[0], /1 \$ref\(s\)[^\n]*\n[^\n]*simple-directory\/partial#\/\$defs\/modifier$/)

    const names = (scopes?: string[]) => (scopes ? toolsForScopes(toolSet, scopes) : toolSet).tools.map(tool => tool.name)
    assert.ok(names().filter(name => name.startsWith('datafair_')).length > 10)
    assert.ok(names().includes('metrics_aggregate_requests'))
    assert.ok(names(['datasets:write']).includes('datafair_update_dataset'))
    assert.ok(!names(['datasets:write']).includes('datafair_publish_dataset'))
    assert.ok(names(['datasets:admin']).includes('datafair_publish_dataset'))
    assert.deepEqual(names(['metrics:read']), ['metrics_aggregate_requests'])
    assert.deepEqual(names([]), [])
    // a skill goes with its tools (data-fair's workflow skill names none: offered to every token)
    assert.ok(toolsForScopes(toolSet, ['metrics:read']).skills.some(skill => skill.name === 'metrics-review'))
    assert.ok(!toolsForScopes(toolSet, ['datasets:read']).skills.some(skill => skill.name === 'metrics-review'))
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
