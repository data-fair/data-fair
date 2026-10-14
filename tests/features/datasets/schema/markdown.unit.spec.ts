import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { prepareMarkdownContent } from '../../../../api/src/misc/utils/markdown.ts'

// updatedAt is left undefined in most cases below to bypass the memoized path
// (prepareMarkdownContent only memoizes on key/updatedAt/html/truncate, not on
// text - see markdown.ts) and exercise `prepare` directly for byte-for-byte checks.

test.describe('prepareMarkdownContent rendering/sanitization/truncation matrix', () => {
  const text = 'This is a **markdown** description.'

  test('no html param: markdown syntax passes through unchanged', () => {
    assert.equal(prepareMarkdownContent(text, undefined, null, 'k1', undefined), text)
  })

  test('no html param + truncate: middle-truncates the raw markdown text', () => {
    assert.equal(prepareMarkdownContent(text, undefined, 16, 'k2', undefined), 'This is a **mark...')
  })

  test('html=true: renders markdown to HTML', () => {
    assert.equal(
      prepareMarkdownContent(text, 'true', null, 'k3', undefined),
      '<p>This is a <strong>markdown</strong> description.</p>'
    )
  })

  test('html=true + truncate: truncates the rendered HTML (tag-aware)', () => {
    assert.equal(
      prepareMarkdownContent(text, 'true', 16, 'k4', undefined),
      '<p>This is a <strong>markdo...</strong></p>'
    )
  })

  test('html=vuetify: renders markdown with vuetify paragraph classes', () => {
    assert.equal(
      prepareMarkdownContent(text, 'vuetify', null, 'k5', undefined),
      '<p class="markdown-paragraph mt-4 mb-4">This is a <strong>markdown</strong> description.</p>'
    )
  })

  test('html=true: sanitizes raw HTML tags mixed into the source text (strips script, drops attributes)', () => {
    const htmlText = 'This is a <span color="blue">html</span><span color="red"> description</span><script>alert("ALERT")</script>.'
    assert.equal(
      prepareMarkdownContent(htmlText, 'true', null, 'k6', undefined),
      '<p>This is a <span>html</span><span> description</span>.</p>'
    )
  })
})

test.describe('prepareMarkdownContent memoization', () => {
  // Cache key is (key, updatedAt, html, truncate) only - text is NOT part of it
  // (see length: 4 in markdown.ts). Reusing the same key+updatedAt+html+truncate
  // with different text returns the FIRST result: a real gotcha for callers.
  test('caches by key/updatedAt/html/truncate, ignoring text, when updatedAt is set', () => {
    const updatedAt = '2026-01-01T00:00:00.000Z'
    const first = prepareMarkdownContent('first text', 'true', null, 'memo-key', updatedAt)
    const second = prepareMarkdownContent('second text', 'true', null, 'memo-key', updatedAt)
    assert.equal(second, first)

    // a different key busts the cache
    const third = prepareMarkdownContent('second text', 'true', null, 'other-memo-key', updatedAt)
    assert.equal(third, '<p>second text</p>')

    // a different updatedAt busts the cache too
    const fourth = prepareMarkdownContent('second text', 'true', null, 'memo-key', '2026-02-01T00:00:00.000Z')
    assert.equal(fourth, '<p>second text</p>')
  })

  test('no caching when updatedAt is falsy: text always reflects the latest call', () => {
    const first = prepareMarkdownContent('first text', 'true', null, 'no-cache-key', undefined)
    const second = prepareMarkdownContent('second text', 'true', null, 'no-cache-key', undefined)
    assert.equal(first, '<p>first text</p>')
    assert.equal(second, '<p>second text</p>')
  })
})
