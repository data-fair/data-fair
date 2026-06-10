import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('embed dataset table page', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays dataset table with data', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })

  test('displays dataset journal', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/journal`, 'test_user1')
    await expect(page.getByText('le jeu de données a été entièrement traité')).toBeVisible({ timeout: 10000 })
  })

  // Regression for #1755: when an embedding parent drops a filter from the URL via <d-frame>
  // (an in-app router.replace, not a reload), the table must refetch without that filter.
  // `id_in=koumoul` is a single-value "in" filter, normalized to "eq" internally by addFilter,
  // which also guards against a naive removal loop matching operators by strict equality.
  test('refetches when a URL filter is removed externally', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table?id_in=koumoul`, 'test_user1')

    // the filter is applied: only the matching row is shown
    await expect(page.getByRole('cell', { name: 'koumoul' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('cell', { name: 'bidule' })).toHaveCount(0)

    // simulate the parent <d-frame> removing the filter: an updateSrc message without the query
    // triggers router.replace in-app (window.parent === window for a standalone embed page)
    await page.evaluate(() => {
      const url = new URL(window.location.href)
      url.search = ''
      window.postMessage(['df-parent', 'updateSrc', url.href], '*')
    })

    // the table must refetch without the filter: the previously filtered-out row appears
    await expect(page.getByRole('cell', { name: 'bidule' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('cell', { name: 'koumoul' })).toBeVisible()
  })
})
