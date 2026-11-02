import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { anonymousAx } from '../../support/axios.ts'

const names = ['datasets', 'datasets:read', 'datasets:write', 'datasets:admin', 'applications', 'applications:read', 'applications:write', 'applications:admin', 'all:read', 'all:write', 'all:admin']
// declared by events, which the dev stack's platform document includes
const eventsNames = ['notifications', 'notifications:read', 'notifications:write', 'events', 'events:read', 'webhooks', 'webhooks:read', 'webhooks:admin']

test.describe('GET /api/v1/scopes.json', () => {
  test('lists the scopes of the platform anonymously, in French by default', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json')
    assert.equal(res.status, 200)
    for (const name of [...names, ...eventsNames]) assert.ok(Object.hasOwn(res.data.scopes, name), name)
    assert.equal(res.data.scopes['all:read'], 'Lire tout ce que permet le rôle, sur tous les services')
    assert.equal(res.data.scopes['datasets:read'], 'Lire les jeux de données, leurs données, leur journal')
    assert.match(String(res.headers['cache-control']), /public, max-age=300/)
    assert.match(String(res.headers.vary), /Accept-Language/i)
  })

  test('answers in English on demand', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json', { headers: { 'accept-language': 'en' } })
    assert.equal(res.data.scopes['datasets:read'], 'Read datasets, their data and journal')
    assert.equal(res.data.scopes['all:read'], 'Read everything the role allows, across services')
  })

  test('honours If-None-Match', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json')
    assert.ok(res.headers.etag)
    const again = await anonymousAx.get('/api/v1/scopes.json', { headers: { 'if-none-match': res.headers.etag }, validateStatus: () => true })
    assert.equal(again.status, 304)
    assert.match(String(again.headers.vary), /Accept-Language/i)
  })
})
