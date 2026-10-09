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

    // the visible result count is itself the status message
    const liveRegion = page.locator('[role="status"]').first()
    await expect(liveRegion).toContainText(/\d+\s+(ligne|line)/i, { timeout: 5000 })

    const input = page.locator('[role="search"] input').first()
    await input.fill('zzz_no_match_expected_zzz')
    await input.press('Enter')

    await expect(liveRegion).toContainText(/(aucune|no)\s+(ligne|line)/i, { timeout: 5000 })
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
    // Vuetify's v-menu renders as .v-overlay--active.v-menu (no role="menu" on the overlay itself)
    await expect(page.locator('.v-overlay--active.v-menu').first()).toBeVisible({ timeout: 2000 })
    // Closing the menu must return focus to the trigger button so keyboard users
    // don't get dropped on <body> after Escape (RGAA 7.3 / 12.8)
    // Vuetify only honors Escape on the top overlay, a flag it updates in a setTimeout after
    // opening: let that timer run first, a human can't press Escape within the same few ms
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve)))
    await page.keyboard.press('Escape')
    await expect(page.locator('.v-overlay--active.v-menu')).toHaveCount(0)
    await expect(firstSortButton).toBeFocused()
  })

  test('sort and column visibility states are exposed without relying on color (7.1 / 3.1)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })
    const firstHeader = page.locator('thead th button').first()
    const menu = page.locator('.v-overlay--active.v-menu')

    // the active sort option carries aria-current, not only the visual active style
    await firstHeader.click()
    // reopening the menu while the sorted lines are still loading is not reliable, wait for them
    const sortedLines = page.waitForResponse(r => r.url().includes('/lines') && r.url().includes('sort='))
    await menu.getByRole('listitem').filter({ hasText: /tri ascendant|ascending sort/i }).click()
    await sortedLines
    // picking a sort closes the menu
    await expect(menu).toHaveCount(0)
    await expect(page.locator('thead th[aria-sort="ascending"]')).toHaveCount(1)
    await expect(page.locator('thead th[aria-sort]')).toHaveCount(1)
    await firstHeader.click()
    await expect(menu).toBeVisible()
    await expect(menu.locator('[aria-current="true"]')).toContainText(/tri ascendant|ascending sort/i)
    await expect(menu.locator('[aria-current="true"]')).toHaveCount(1)

    // hiding a column shows a count on the column selector and names it for assistive technologies
    await menu.getByRole('listitem').filter({ hasText: /masquer|hide/i }).first().click()
    const selectCols = page.getByRole('button', { name: /colonnes? masquées?|columns? hidden/i })
    await expect(selectCols).toHaveAccessibleName(/1 colonne masquée|1 column hidden/i)
    await expect(selectCols.locator('.v-badge__badge')).toHaveText('1')
  })
})
