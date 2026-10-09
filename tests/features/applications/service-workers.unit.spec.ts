import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// service-workers.ts reads #config (publicUrl, applicationsDirectories): point it to the api config
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')
const { sw } = await import('../../../api/src/misc/utils/service-workers.ts')

// The cache-first routes of the applications service worker never expire, so they must only match
// URLs that are really timestamped: an empty finalizedAt/updatedAt pinned stale values forever.
test.describe('applications service worker', () => {
  const cacheFirstRegexps = [...sw().matchAll(/new RegExp\('([^']*(?:finalizedAt|updatedAt)[^']*)'\),\s*workbox\.strategies\.cacheFirst/g)]
    .map(m => new RegExp(m[1].replaceAll('\\\\', '\\')))
  const isCacheFirst = (url: string) => cacheFirstRegexps.some(r => r.test(url))

  test('serves timestamped dataset queries cache first', () => {
    assert.equal(cacheFirstRegexps.length, 2)
    assert.ok(isCacheFirst('/data-fair/api/v1/datasets/ds1/values-labels/f?finalizedAt=2026-09-28T12:36:40.499Z&stringify=true'))
    assert.ok(isCacheFirst('/data-fair/api/v1/datasets/ds1/lines?size=10&updatedAt=2026-09-28T12:36:40.499Z'))
  })

  test('does not pin dataset queries with an empty or missing timestamp', () => {
    assert.ok(!isCacheFirst('/data-fair/api/v1/datasets/ds1/values-labels/f?finalizedAt=&stringify=true'))
    assert.ok(!isCacheFirst('/data-fair/api/v1/datasets/ds1/lines?size=10&finalizedAt='))
    assert.ok(!isCacheFirst('/data-fair/api/v1/datasets/ds1/lines?updatedAt=&size=10'))
    assert.ok(!isCacheFirst('/data-fair/api/v1/datasets/ds1/lines?size=10'))
  })
})
