import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

// geo CSV with a low-cardinality "ville" column; lat/lon tagged as geo concepts
// in the upload body so the map works without a post-upload schema patch
const geoBody = {
  schema: [
    { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
    { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
  ]
}

test.describe('embed dataset map page with category param', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('shows a legend and toggles filters from it', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/Antennes du CD22.csv', ax, undefined, geoBody)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/map?category=ville`, 'test_user1')

    // legend overlay: field title + one entry per value
    const legend = page.locator('.dataset-map-legend')
    await expect(legend).toBeVisible({ timeout: 10000 })
    await expect(legend.getByText('ville')).toBeVisible()
    await expect(legend.getByText('Dinan')).toBeVisible()
    await expect(legend.getByText('Guingamp')).toBeVisible()

    const dinanRow = legend.locator('.dataset-map-legend--item', { hasText: 'Dinan' })
    const guingampRow = legend.locator('.dataset-map-legend--item', { hasText: 'Guingamp' })

    // first click: single value -> normalized to an eq filter in the URL, and the
    // legend must dim non-active rows immediately (no reload needed)
    await legend.getByText('Dinan').click()
    await expect(page).toHaveURL(/ville_eq=Dinan/)
    await expect(guingampRow).toHaveCSS('opacity', '0.4', { timeout: 5000 })
    await expect(dinanRow).toHaveCSS('opacity', '1')

    // second click: two values -> in filter, both rows now active
    await legend.getByText('Guingamp').click()
    await expect(page).toHaveURL(/ville_in=Dinan(%2C|,)Guingamp/)
    await expect(guingampRow).toHaveCSS('opacity', '1')
    await expect(dinanRow).toHaveCSS('opacity', '1')

    // unclick both: filter removed from the URL, opacity fully restored
    await legend.getByText('Guingamp').click()
    await legend.getByText('Dinan').click()
    await expect(page).not.toHaveURL(/ville_eq|ville_in/)
    await expect(guingampRow).toHaveCSS('opacity', '1')
    await expect(dinanRow).toHaveCSS('opacity', '1')
  })

  test('degrades gracefully on an ineligible category field', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/Antennes du CD22.csv', ax, undefined, geoBody)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/map?category=nope`, 'test_user1')

    await expect(page.getByText('La colonne "nope" ne permet pas de catégoriser la carte')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.dataset-map-legend')).toHaveCount(0)
  })
})
