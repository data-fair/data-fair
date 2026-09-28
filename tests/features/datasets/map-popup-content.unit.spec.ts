import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { escapeHtml, buildPopupHtml } from '../../../ui/src/components/dataset/map/popup-content.ts'

// Both the labels and the values interpolated into a map popup come from user-controlled
// dataset content (column titles and cell values), and maplibre's Popup.setHTML does NOT
// sanitize — its DOM.sanitize is only wired to the AttributionControl. So this module is
// the only thing standing between a dataset cell and innerHTML.

test.describe('escapeHtml', () => {
  test('neutralizes the characters that can open a tag or close an attribute', () => {
    assert.equal(escapeHtml('<img src=x>'), '&lt;img src=x&gt;')
    assert.equal(escapeHtml('a & b'), 'a &amp; b')
    assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;')
    assert.equal(escapeHtml("it's"), 'it&#39;s')
  })

  test('escapes the ampersand first, so an escape is not double-decoded', () => {
    // naive ordering would turn this into "&lt;" rendering as a literal "<"
    assert.equal(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;')
  })

  test('leaves ordinary text untouched', () => {
    assert.equal(escapeHtml('Nombre d’habitants : 1 234'), 'Nombre d’habitants : 1 234')
  })

  test('is total — non-string values are coerced, never thrown on', () => {
    assert.equal(escapeHtml(1234), '1234')
    assert.equal(escapeHtml(['a', '<b>']), 'a,&lt;b&gt;')
    assert.equal(escapeHtml(null), 'null')
  })
})

// the rendered value of a single-item popup: everything between our own static markup.
// Asserting on it exactly proves no attacker character survived unescaped, rather than
// hunting for substrings that are harmless once escaped.
const valuePart = (html: string) => html.slice(html.indexOf('</strong> ') + '</strong> '.length, html.indexOf('</li>'))

test.describe('buildPopupHtml', () => {
  test('renders a list item per field', () => {
    const html = buildPopupHtml([{ label: 'Ville', value: 'Lorient' }, { label: 'Code', value: '56121' }])
    assert.ok(html.startsWith('<ul style="padding-left: 0;">'))
    assert.ok(html.includes('<strong>Ville:</strong> Lorient'))
    assert.ok(html.includes('<strong>Code:</strong> 56121'))
  })

  // the payload shape the maplibre sanitizer bypass (GHSA-jrc7-96c5-q579) relied on: two
  // adjacent dangerous attributes. It never mattered here — setHTML does not sanitize at all —
  // which is exactly why the escaping below has to hold on its own.
  test('a hostile cell value cannot inject markup', () => {
    const html = buildPopupHtml([{ label: 'Ville', value: '<img src=x onerror=alert(1) onload=alert(2)>' }])
    assert.ok(html.includes('&lt;img src=x onerror=alert(1) onload=alert(2)&gt;'))
    assert.equal(valuePart(html), '&lt;img src=x onerror=alert(1) onload=alert(2)&gt;')
  })

  test('a hostile column title cannot inject markup', () => {
    const html = buildPopupHtml([{ label: '</strong><script>alert(1)</script>', value: 'x' }])
    assert.ok(!html.includes('<script>'))
    assert.ok(!html.includes('</strong><'))
  })

  test('a hostile value cannot break out of the inline style attribute', () => {
    const html = buildPopupHtml([{ label: 'a', value: '" onmouseover="alert(1)' }])
    assert.equal(valuePart(html), '&quot; onmouseover=&quot;alert(1)')
  })

  test('an empty field list still produces a well-formed list', () => {
    assert.equal(buildPopupHtml([]), '<ul style="padding-left: 0;"></ul>')
  })
})
