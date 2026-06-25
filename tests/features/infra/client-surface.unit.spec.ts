import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { clientSurface } from '../../../api/src/misc/utils/client-surface.ts'

// pure caller-surface resolution: priority rules in api/src/misc/utils/client-surface.ts.
// 'portal' is referer-driven (a page of the portal initiated the request), NOT domain-driven:
// a raw script hitting the API on a portal domain has no portal referer and stays unclassified.
// Only the production portal url counts — its draft url is treated as unknown.
const publicBaseUrl = 'https://h/data-fair'
const portalUrl = 'https://opendata.example.com'

test.describe('clientSurface', () => {
  test('echoes a known service client even without a referer', () => {
    assert.equal(clientSurface({ explicit: 'agents', publicBaseUrl }), 'agents')
  })

  test('ignores an unknown service client and falls through', () => {
    assert.equal(
      clientSurface({ explicit: 'pirate', referer: publicBaseUrl + '/dataset/x', publicBaseUrl }),
      'backoffice'
    )
  })

  test('no referer (script / server-to-server) is unclassified', () => {
    assert.equal(clientSurface({ portalUrl, publicBaseUrl }), undefined)
  })

  test('a direct API call on a portal domain without referer is NOT portal', () => {
    // on a publication-site domain, but no portal page initiated the request
    assert.equal(
      clientSurface({ portalUrl, publicBaseUrl: 'https://opendata.example.com/data-fair' }),
      undefined
    )
  })

  test('application wins over portal', () => {
    assert.equal(
      clientSurface({ referer: 'https://opendata.example.com/data-fair/app/x', portalUrl, publicBaseUrl }),
      'application'
    )
  })

  test('portal when the referer is a page of the portal', () => {
    assert.equal(
      clientSurface({ referer: 'https://opendata.example.com/datasets/x', portalUrl, publicBaseUrl }),
      'portal'
    )
  })

  test('portal wins over embed when the embed is served on the portal domain', () => {
    assert.equal(
      clientSurface({ referer: 'https://opendata.example.com/data-fair/embed/dataset/x', portalUrl, publicBaseUrl }),
      'portal'
    )
  })

  test('a referer on the portal draft url is treated as unknown', () => {
    assert.equal(
      clientSurface({ referer: 'https://opendata-draft.example.com/datasets/x', portalUrl, publicBaseUrl }),
      undefined
    )
  })

  test('embed when the embed is served outside any portal domain', () => {
    assert.equal(
      clientSurface({ referer: 'https://h/data-fair/embed/dataset/x', publicBaseUrl }),
      'embed'
    )
  })

  test('backoffice for a same-origin referer', () => {
    assert.equal(
      clientSurface({ referer: publicBaseUrl + '/dataset/x', publicBaseUrl }),
      'backoffice'
    )
  })

  test('a third-party referer is unclassified', () => {
    assert.equal(
      clientSurface({ referer: 'https://autre.site/page', publicBaseUrl }),
      undefined
    )
  })
})
