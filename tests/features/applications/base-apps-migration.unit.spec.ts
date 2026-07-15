import { test } from '@playwright/test'
import assert from 'node:assert/strict'

// pure helpers, no #config import -> safe to statically import.
// Lives in src/base-applications/ (NOT inside api/upgrade/6.16.1/): the upgrade-scripts
// runner treats every file directly under a version folder as a script and calls
// `.default.description`/`.exec()` on it with no filtering, so a non-script helper module
// placed there crashes the runner (confirmed against the dev stack: TypeError reading
// 'description' of undefined, dev-api stuck in a crash loop).
import {
  mapUrlToArtefact, newBaseAppUrl, rewriteTextAsset, parseWebpackChunkUrls, extractHtmlAssetRefs
} from '../../../api/src/base-applications/base-apps-migration-utils.ts'

test.describe('base-apps migration helpers', () => {
  test('mapUrlToArtefact maps the two production url families deterministically', () => {
    assert.deepEqual(mapUrlToArtefact('https://cdn.jsdelivr.net/npm/@data-fair/app-charts@1.3/dist/'), {
      artefactId: '@data-fair/app-charts@1.3', packageName: '@data-fair/app-charts', minor: '1.3', npmPackage: '@data-fair/app-charts'
    })
    assert.deepEqual(mapUrlToArtefact('https://koumoul.com/apps/sankey/1.5/'), {
      artefactId: '@koumoul/sankey@1.5', packageName: '@koumoul/sankey', minor: '1.5', npmPackage: undefined
    })
    assert.equal(mapUrlToArtefact('https://staging-koumoul.com/apps/sankey/1.5/')?.artefactId, '@koumoul/sankey@1.5')
    assert.equal(mapUrlToArtefact('https://example.com/somewhere/'), null)
    // already-migrated urls must NOT match (idempotency)
    assert.equal(mapUrlToArtefact('https://koumoul.com/data-fair/app-assets/@koumoul/sankey/1.5/'), null)
  })

  test('newBaseAppUrl builds the canonical data-fair url', () => {
    assert.equal(newBaseAppUrl('https://koumoul.com/data-fair', '@koumoul/sankey', '1.5'),
      'https://koumoul.com/data-fair/app-assets/@koumoul/sankey/1.5/')
  })

  test('rewriteTextAsset relativizes the app own absolute prefix, depth-aware for css', () => {
    const prefixes = ['https://koumoul.com/apps/infos-parcelles/2.9/']
    assert.equal(
      rewriteTextAsset('<script src="https://koumoul.com/apps/infos-parcelles/2.9/js/app.js">', prefixes, 'index.html'),
      '<script src="./js/app.js">')
    assert.equal(
      rewriteTextAsset('o.p="https://koumoul.com/apps/infos-parcelles/2.9/"', prefixes, 'js/app.3ff54bd9.js'),
      'o.p="./"')
    // a css file one level deep must climb back to the app root
    assert.equal(
      rewriteTextAsset('url(https://koumoul.com/apps/infos-parcelles/2.9/fonts/x.woff)', prefixes, 'css/app.css'),
      'url(../fonts/x.woff)')
  })

  test('parseWebpackChunkUrls reconstructs lazy chunk urls from the runtime maps', () => {
    // minimal vue-cli/webpack4 runtime shape
    const entry = 'function jsonpScriptSrc(e){return o.p+"js/"+({1:"about",3:"map"}[e]||e)+"."+{1:"11aa22bb",3:"33cc44dd"}[e]+".js"}'
    const urls = parseWebpackChunkUrls(entry, 'https://koumoul.com/apps/x/1.0/')
    assert.ok(urls.includes('https://koumoul.com/apps/x/1.0/js/about.11aa22bb.js'))
    assert.ok(urls.includes('https://koumoul.com/apps/x/1.0/js/map.33cc44dd.js'))
    // and the mini-css-extract css map shape
    const entryCss = 'var href="css/"+({2:"detail"}[e]||e)+"."+{2:"55ee66ff"}[e]+".css";'
    const cssUrls = parseWebpackChunkUrls(entryCss, 'https://koumoul.com/apps/x/1.0/')
    assert.ok(cssUrls.includes('https://koumoul.com/apps/x/1.0/css/detail.55ee66ff.css'))
  })

  test('extractHtmlAssetRefs collects src and href attributes', () => {
    const refs = extractHtmlAssetRefs('<link href="https://a/x.css"><script src="./assets/i.js"></script><meta name="x">')
    assert.deepEqual(refs.sort(), ['./assets/i.js', 'https://a/x.css'])
  })
})
