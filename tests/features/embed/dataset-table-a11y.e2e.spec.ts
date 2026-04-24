import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('embed dataset table — accessibility (RGAA)', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('table exposes an accessible name and column scopes (5.5 / 5.6)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 15000 })

    // 5.5 — accessible name: prefer <caption>, fall back to aria-label
    const captions = await table.locator('caption').count()
    const ariaLabel = await table.getAttribute('aria-label')
    expect(captions > 0 || Boolean(ariaLabel)).toBe(true)

    // 5.6 — each column header has scope="col"
    const ths = await table.locator('thead > tr > th').all()
    expect(ths.length).toBeGreaterThan(0)
    for (const th of ths) {
      await expect(th).toHaveAttribute('scope', 'col')
    }
  })

  test('search field is labelled and wrapped in a search landmark (7.1 / 12.6)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    const searchLandmark = page.locator('[role="search"]').first()
    await expect(searchLandmark).toBeAttached()

    // Submit button must expose an explicit accessible name
    const submit = searchLandmark.getByRole('button').first()
    await expect(submit).toHaveAccessibleName(/recherche|search/i)
  })

  test('search results are announced via aria-live (7.5)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    const liveRegion = page.locator('[aria-live="polite"][role="status"]').first()
    await expect(liveRegion).toBeAttached()

    const input = page.locator('[role="search"] input').first()
    await input.fill('zzz_no_match_expected_zzz')
    await input.press('Enter')

    await expect(liveRegion).toContainText(/résultat|result/i, { timeout: 5000 })
  })

  test('scrollable table wrapper is focusable and sort is keyboard-activable (7.3)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    // 7.3 — scrollable wrapper must be reachable by Tab so keyboard users can scroll rows
    const scrollWrapper = page.locator('.dataset-table .v-table__wrapper').first()
    await expect(scrollWrapper).toHaveAttribute('tabindex', '0')

    // Each sortable column header exposes a real focusable button
    const firstSortButton = page.locator('thead th button[aria-haspopup="menu"]').first()
    await expect(firstSortButton).toBeVisible()
    await firstSortButton.focus()
    await expect(firstSortButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('[role="menu"]').first()).toBeVisible({ timeout: 2000 })
    await page.keyboard.press('Escape')
  })
})
