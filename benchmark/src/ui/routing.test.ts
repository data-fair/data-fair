import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRequest, renderIndex, extractUiConfigPath } from './routing.ts'

const files = new Set(['assets/index-abc.js', 'favicon.ico'])
const hasFile = (rel: string) => files.has(rel)

test('API requests go to the stack', () => {
  assert.deepEqual(classifyRequest('/data-fair/api/v1/datasets/x/lines', false, hasFile), { action: 'stack' })
})

test('the ui-config script goes to the stack', () => {
  assert.deepEqual(classifyRequest('/data-fair/927d47f3-ui-config.js', false, hasFile), { action: 'stack' })
})

test('files of the build are served from disk', () => {
  assert.deepEqual(classifyRequest('/data-fair/assets/index-abc.js', false, hasFile), { action: 'file', file: 'assets/index-abc.js' })
})

test('assets the build does not have go to the stack', () => {
  assert.deepEqual(classifyRequest('/data-fair/assets/other.png', false, hasFile), { action: 'stack' })
})

test('page navigations get the variant index', () => {
  assert.deepEqual(classifyRequest('/data-fair/embed/dataset/x/table', true, hasFile), { action: 'index' })
})

test('non-navigation unknown paths go to the stack', () => {
  assert.deepEqual(classifyRequest('/data-fair/app-sw.js', false, hasFile), { action: 'stack' })
})

test('renderIndex fills every placeholder like the vite dev server', () => {
  const raw = '<link href="{SITE_PATH}/simple-directory/api/sites/{THEME_CSS_HASH}_theme.css"><script>window.__CSP_NONCE="{CSP_NONCE}"</script>' +
    '<script src="{SITE_PATH}/simple-directory/api/sites/{PUBLIC_SITE_INFO_HASH}_public.js"></script><script src="{SITE_PATH}/data-fair{UI_CONFIG_PATH}"></script>'
  const html = renderIndex(raw, '/abc-ui-config.js')
  assert.doesNotMatch(html, /\{[A-Z_]+\}/)
  assert.match(html, /src="\/data-fair\/abc-ui-config\.js"/)
  assert.match(html, /href="\/simple-directory\/api\/sites\/_theme\.css"/)
})

test('extractUiConfigPath reads the path from the stack page', () => {
  assert.equal(extractUiConfigPath('<script src="/data-fair/927d47f3202c48764f00e654c9fedf8f-ui-config.js"></script>'), '/927d47f3202c48764f00e654c9fedf8f-ui-config.js')
  assert.throws(() => extractUiConfigPath('<html></html>'), /ui-config/)
})
