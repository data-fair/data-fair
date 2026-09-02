import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as parse5 from 'parse5'
import { setUniqueRefs, buildManifest, buildLoginHtml, injectApplicationGlobal } from '../../../api/src/applications/operations.ts'

const inject = (html: string, json: string) => {
  const document = parse5.parse(html)
  const count = injectApplicationGlobal(document, json)
  return { count, html: parse5.serialize(document) }
}
const appJson = JSON.stringify({ id: 'a1', title: 'My app' })

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
  test('injectApplicationGlobal: fills the window.APPLICATION script', () => {
    const { count, html } = inject('<html><head><script>window.APPLICATION=%APPLICATION%;</script></head><body></body></html>', appJson)
    assert.equal(count, 1)
    assert.ok(html.includes(`window.APPLICATION=${appJson};`))
    assert.ok(!html.includes('%APPLICATION%'))
  })
  test('injectApplicationGlobal: a comment naming the placeholder does not consume the substitution', () => {
    // the regression app-calendar 1.3.0 shipped: it documents the contract in a comment placed
    // above the script, which used to eat the single non-global replace and leave the script
    // with a literal %APPLICATION% — a syntax error, so the app never got its configuration
    const { count, html } = inject(
      '<html><head><!-- the proxy substitutes %APPLICATION% --><script>window.APPLICATION=%APPLICATION%;</script></head><body></body></html>',
      appJson
    )
    assert.equal(count, 1)
    assert.ok(html.includes(`window.APPLICATION=${appJson};`), 'the script is filled')
    assert.ok(html.includes('<!-- the proxy substitutes %APPLICATION% -->'), 'the comment is left untouched')
  })
  test('injectApplicationGlobal: never substitutes outside a script', () => {
    // substituting everywhere would let a `-->` in any user-provided string close a comment
    // early and turn the rest of the JSON into markup
    const hostile = JSON.stringify({ id: 'a1', title: 'end of comment --> <img src=x onerror=alert(1)>' })
    const { count, html } = inject('<html><head><!-- %APPLICATION% --></head><body><p>%APPLICATION%</p></body></html>', hostile)
    assert.equal(count, 0)
    assert.ok(!html.includes('<img'), 'no markup escapes from the JSON')
    assert.ok(html.includes('<!-- %APPLICATION% -->'), 'the comment keeps its placeholder')
    assert.ok(html.includes('<p>%APPLICATION%</p>'), 'body text keeps its placeholder')
  })
  test('injectApplicationGlobal: fills every script that declares the placeholder', () => {
    const { count, html } = inject(
      '<html><head><script>window.APPLICATION=%APPLICATION%;</script></head><body><script>const a=%APPLICATION%;</script></body></html>',
      appJson
    )
    assert.equal(count, 2)
    assert.ok(!html.includes('%APPLICATION%'))
  })
  test('injectApplicationGlobal: leaves a document without the placeholder untouched', () => {
    const source = '<html><head><script>const a=1;</script></head><body>hello</body></html>'
    const { count, html } = inject(source, appJson)
    assert.equal(count, 0)
    assert.ok(html.includes('const a=1;'))
    assert.ok(html.includes('hello'))
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
