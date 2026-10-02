/**
 * The deployment index agents are configured with: which service-level OpenAPI documents exist
 * on this site. data-fair is the aggregator; siblings are listed by the same rule the UI uses to
 * decide an integration exists, at the site origin plus their conventional mount path.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validateIndex } from '@data-fair/openapi-mcp'
import { agentsIndex } from '../../../api/contract/agents-index.ts'

const cfg = { publicUrl: 'http://localhost:8080/data-fair', directoryUrl: 'https://host.test/simple-directory', privateProcessingsUrl: null, privateMetricsUrl: null }

test.describe('agentsIndex', () => {
  test('lists data-fair and simple-directory at the request public base URL, validating against the contract', () => {
    const index = agentsIndex('https://host.test/data-fair', cfg)
    assert.doesNotThrow(() => validateIndex(index))
    assert.equal(index.version, 1)
    assert.deepEqual(index.services, [
      { id: 'data-fair', openapi: 'https://host.test/data-fair/api/v1/api-docs.json' },
      { id: 'simple-directory', openapi: 'https://host.test/simple-directory/api/api-docs.json' }
    ])
  })
  const silos = ['datasets', 'applications', 'portals', 'processings', 'catalogs', 'notifications', 'metrics', 'account']

  test('declares the whole profile vocabulary: catalog first, umbrellas, every cell, platform, the explore alias', () => {
    const profiles = agentsIndex('https://host.test/data-fair', cfg).profiles!
    assert.equal(Object.keys(profiles)[0], 'catalog')
    for (const tier of ['read', 'write', 'manage']) {
      assert.deepEqual(profiles[tier].includes, silos.map(s => `${tier}_${s}`))
    }
    assert.equal(profiles.read_portals.includes, undefined)
    assert.deepEqual(profiles.write_portals.includes, ['read_portals'])
    assert.deepEqual(profiles.manage_portals.includes, ['write_portals'])
    assert.deepEqual(profiles.explore.includes, ['catalog'])
    assert.deepEqual(profiles.manage_metrics.title, { fr: "Administrer — métriques d'audience", en: 'Manage — audience metrics' })
    assert.ok(profiles.platform)
  })

  test('pins the vocabulary: names are only ever appended', () => {
    const cells = silos.flatMap(s => ['read', 'write', 'manage'].map(t => `${t}_${s}`))
    assert.deepEqual(Object.keys(agentsIndex('https://host.test/data-fair', cfg).profiles!), ['catalog', 'read', 'write', 'manage', ...cells, 'platform', 'explore'])
  })

  test('lists processings at the site origin when its integration is configured', () => {
    const index = agentsIndex('https://host.test/data-fair', { ...cfg, privateProcessingsUrl: 'http://processings:8080' })
    assert.deepEqual(index.services.map(s => s.id), ['data-fair', 'processings', 'simple-directory'])
    assert.equal(index.services[1].openapi, 'https://host.test/processings/api/v1/admin/api-docs.json')
  })
  test('lists metrics at the site origin when its integration is configured', () => {
    const index = agentsIndex('https://host.test/data-fair', { ...cfg, privateProcessingsUrl: 'http://processings:8080', privateMetricsUrl: 'http://metrics:8080' })
    assert.doesNotThrow(() => validateIndex(index))
    assert.deepEqual(index.services.map(s => s.id), ['data-fair', 'processings', 'metrics', 'simple-directory'])
    assert.equal(index.services[2].openapi, 'https://host.test/metrics/api/api-docs.json')
  })
  test('derives the site base from the public base URL minus data-fair\'s own mount path', () => {
    const index = agentsIndex('https://other.test/site/data-fair', { ...cfg, publicUrl: 'https://host.test/data-fair', privateProcessingsUrl: 'x' })
    assert.equal(index.services[1].openapi, 'https://other.test/site/processings/api/v1/admin/api-docs.json')
  })
})
