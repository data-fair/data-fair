import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { setUniqueRefs, buildManifest, buildLoginHtml } from '../../../api/src/applications/operations.ts'

test.describe('applications operations', () => {
  test('setUniqueRefs: id only when slug === id', () => {
    const app: any = { id: 'a', slug: 'a' }
    setUniqueRefs(app)
    assert.deepEqual(app._uniqueRefs, ['a'])
  })
  test('setUniqueRefs: id + slug when they differ', () => {
    const app: any = { id: 'a', slug: 'my-app' }
    setUniqueRefs(app)
    assert.deepEqual(app._uniqueRefs, ['a', 'my-app'])
  })
  test('setUniqueRefs: no refs without slug', () => {
    const app: any = { id: 'a' }
    setUniqueRefs(app)
    assert.equal(app._uniqueRefs, undefined)
  })
  test('buildManifest: standalone names + scope from exposedUrl', () => {
    const app: any = { title: 'T', description: 'D', exposedUrl: 'https://h/data-fair/app/a' }
    const m = buildManifest(app, { id: 'base' }, 'https://h/data-fair')
    assert.equal(m.name, 'T')
    assert.equal(m.short_name, 'T')
    assert.equal(m.display, 'standalone')
    assert.equal(m.start_url, '/data-fair/app/a/')
    assert.equal(m.scope, '/data-fair/app/a/')
    assert.equal(m.icons.length, 7)
    assert.ok(m.icons[0].src.includes('/api/v1/base-applications/base/icon'))
  })
  test('buildLoginHtml: substitutes auth route, logo and empty error', () => {
    const tpl = '<a href="{AUTH_ROUTE}"><img src="{LOGO}">{ERROR}</a>'
    const html = buildLoginHtml(tpl, {
      siteUrl: 'https://h',
      application: { owner: { type: 'organization', id: 'o' } } as any,
      applicationId: 'a',
      error: undefined
    })
    assert.ok(html.includes('/simple-directory/api/auth/password'))
    assert.ok(html.includes('redirect=https%3A%2F%2Fh%2Fdata-fair%2Fapp%2Fa'))
    assert.ok(html.includes('org=o'))
    assert.ok(html.includes('/avatars/organization/o/avatar.png'))
    assert.ok(!html.includes('{ERROR}'))
  })
  test('buildLoginHtml: renders error paragraph when error present', () => {
    const tpl = '{ERROR}'
    const html = buildLoginHtml(tpl, {
      siteUrl: 'https://h',
      application: { owner: { type: 'user', id: 'u' } } as any,
      applicationId: 'a',
      error: 'bad'
    })
    assert.ok(html.includes('color:red'))
    assert.ok(html.includes('bad'))
  })
  test('buildLoginHtml: escapes HTML in the error message', () => {
    const tpl = '{ERROR}'
    const html = buildLoginHtml(tpl, {
      siteUrl: 'https://h',
      application: { owner: { type: 'user', id: 'u' } } as any,
      applicationId: 'a',
      error: '<script>alert(1)</script>'
    })
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })
})
