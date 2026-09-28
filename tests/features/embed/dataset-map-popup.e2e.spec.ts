import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

// A single geo point whose "nom" cell, and whose column title, both carry markup.
// maplibre's Popup.setHTML does not sanitize (its DOM.sanitize is only wired to the
// AttributionControl), so the escaping in popup-content.ts is the only thing between a
// dataset cell and innerHTML. Note the dev SPA is served by vite with no CSP header, so
// an injected `onerror` really would run here — which is what makes this a real check.
const geoBody = {
  schema: [
    { key: 'nom', type: 'string', title: '<img src=y onerror="window.__xssTitle = 1">' },
    { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
    { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
  ]
}

test.describe('embed dataset map popup', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('escapes dataset content instead of injecting it as markup', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/geo-html-injection.csv', ax, undefined, geoBody)

    // the dev stack has no tileserver, so the basemap style 404s and MapLibre never fires
    // "load" — serve a minimal style (with the configured beforeLayer id) instead
    await page.route('**/tileserver/styles/**', route => route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: 'poi_label', type: 'background', paint: { 'background-color': '#eeeeee' } }] }
    }))

    const tileRequest = page.waitForRequest(req => req.url().includes('format=pbf'), { timeout: 15000 })
    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/map`, 'test_user1')
    await tileRequest

    // a single point is centered by fitBounds at maxZoom 15, where the circle radius is
    // ~10px — so the canvas center is a reliable hit for queryRenderedFeatures. The tile
    // request resolving does not mean the point is painted yet, so hover until the layer's
    // mousemove handler turns the cursor into a pointer: that is the map telling us the
    // feature is now hit-testable, and only then is a click meaningful.
    const canvas = page.locator('.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    const box = (await canvas.boundingBox())!
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    let jitter = 0
    await expect.poll(async () => {
      // alternate by a pixel so every poll really dispatches a fresh mousemove
      jitter = jitter ? 0 : 1
      await page.mouse.move(cx + jitter, cy)
      return page.evaluate(() => (document.querySelector('.maplibregl-canvas') as HTMLElement)?.style.cursor)
    }, { timeout: 15000 }).toBe('pointer')
    await page.mouse.click(cx, cy)

    const popup = page.locator('.maplibregl-popup-content')
    await expect(popup).toBeVisible({ timeout: 10000 })

    // the payloads are rendered as visible text, not parsed into elements
    await expect(popup).toContainText('<img src=x onerror="window.__xss = 1">')
    await expect(popup).toContainText('<img src=y onerror="window.__xssTitle = 1">')
    await expect(popup.locator('img')).toHaveCount(0)
    assertNoHandlerRan(await page.evaluate(() => [(window as any).__xss, (window as any).__xssTitle]))
  })
})

const assertNoHandlerRan = ([value, title]: unknown[]) => {
  expect(value, 'an injected cell value executed').toBeUndefined()
  expect(title, 'an injected column title executed').toBeUndefined()
}
