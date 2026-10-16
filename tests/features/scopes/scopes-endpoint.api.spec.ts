import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { anonymousAx } from '../../support/axios.ts'

const names = ['datasets', 'datasets:read', 'datasets:write', 'datasets:admin', 'applications', 'applications:read', 'applications:write', 'applications:admin']

test.describe('GET /api/v1/scopes.json', () => {
  test('lists the 8 scopes anonymously, in French by default', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json')
    assert.equal(res.status, 200)
    assert.deepEqual(Object.keys(res.data.scopes).sort(), [...names].sort())
    assert.equal(res.data.scopes['datasets:read'], 'Lire les jeux de données, leurs données, leur journal')
    assert.match(String(res.headers['cache-control']), /public, max-age=300/)
    assert.match(String(res.headers.vary), /Accept-Language/i)
  })

  test('answers in English on demand', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json', { headers: { 'accept-language': 'en' } })
    assert.equal(res.data.scopes['datasets:read'], 'Read datasets, their data and journal')
  })

  test('honours If-None-Match', async () => {
    const res = await anonymousAx.get('/api/v1/scopes.json')
    assert.ok(res.headers.etag)
    const again = await anonymousAx.get('/api/v1/scopes.json', { headers: { 'if-none-match': res.headers.etag }, validateStatus: () => true })
    assert.equal(again.status, 304)
    assert.match(String(again.headers.vary), /Accept-Language/i)
  })
})
