import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

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

  test('the header menu opens from the keyboard and gives focus back on close (7.3)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

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
    // known bug, on master too: a header click right after a sort often does not open its
    // menu (the click reaches the button, the menu does not toggle); retry until it opens
    await expect(async () => {
      await firstHeader.click()
      await expect(menu).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10000 })
    await expect(menu.locator('[aria-current="true"]')).toContainText(/tri ascendant|ascending sort/i)
    await expect(menu.locator('[aria-current="true"]')).toHaveCount(1)

    // hiding a column shows a count on the column selector and names it for assistive technologies
    await menu.getByRole('listitem').filter({ hasText: /masquer|hide/i }).first().click()
    const selectCols = page.getByRole('button', { name: /colonnes? masquées?|columns? hidden/i })
    await expect(selectCols).toHaveAccessibleName(/1 colonne masquée|1 column hidden/i)
    await expect(selectCols.locator('.v-badge__badge')).toHaveText('1')
  })

  test.describe('keyboard navigation between cells (7.3)', () => {
    const activeCell = (page: any) => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      const cell = el?.closest('[data-row]') as HTMLElement | null
      return {
        inTable: !!el?.closest('.dataset-table'),
        isCell: !!el?.matches('[data-row]'),
        row: cell ? Number(cell.dataset.row) : null,
        col: cell ? Number(cell.dataset.col) : null
      }
    })
    const colOf = async (page: any, title: string) => page.locator('.dataset-table thead th').evaluateAll(
      (ths: HTMLElement[], t: string) => ths.findIndex(th => th.textContent?.trim() === t), title)

    test('the table is a single Tab stop and arrows move between cells', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = await sendDataset('datasets/dataset1.csv', ax)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })

      await page.locator('[role="search"] input').first().focus()
      for (let i = 0; i < 15 && !(await activeCell(page)).inTable; i++) await page.keyboard.press('Tab')
      expect(await activeCell(page)).toMatchObject({ inTable: true, isCell: true, row: 1, col: 0 })

      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      expect(await activeCell(page)).toMatchObject({ isCell: true, row: 2, col: 1 })

      // one Tab leaves the table, Shift+Tab comes back to the same cell
      await page.keyboard.press('Tab')
      expect((await activeCell(page)).inTable).toBe(false)
      await page.keyboard.press('Shift+Tab')
      expect(await activeCell(page)).toMatchObject({ isCell: true, row: 2, col: 1 })
    })

    test('Enter reaches the controls of a cell, Escape returns to the cell', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = await sendDataset('datasets/dataset1.csv', ax)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'adr')
      const cell = page.locator(`.dataset-table td[data-row="1"][data-col="${col}"]`)
      await cell.focus()

      // a focused cell shows the buttons a mouse hover shows
      const filterButton = cell.getByRole('button', { name: /filtrer|filter/i })
      await expect(filterButton).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(filterButton).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(cell).toBeFocused()

      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(1)
    })

    test('ArrowUp reaches the header, Enter opens its menu', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = await sendDataset('datasets/dataset1.csv', ax)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'adr')
      await page.locator(`.dataset-table td[data-row="1"][data-col="${col}"]`).focus()

      await page.keyboard.press('ArrowUp')
      expect(await activeCell(page)).toMatchObject({ isCell: true, row: 0, col })
      await page.keyboard.press('Enter')
      await expect(page.locator('.v-overlay--active.v-menu')).toBeVisible()
    })

    test('a cell reached with ArrowUp is not hidden under the sticky header', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'keyboard-up', schema: [{ key: 'n', type: 'integer' }] })).data
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, Array.from({ length: 100 }, (_, n) => ({ n })))
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      await page.locator('.dataset-table td[data-row="1"][data-col="0"]').focus()

      // go down far enough to scroll, then scroll by hand so the next row up sits under the header
      for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown')
      const row = (await activeCell(page)).row!
      // rows are 40px high under a sticky header: row r-1 (index r-2) is half under the header
      // once scrollTop passes (r-2) * 40
      await page.locator('.dataset-table .v-table__wrapper').evaluate((wrapper: HTMLElement, r: number) => {
        wrapper.scrollTop = (r - 2) * 40 + 20
      }, row)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.keyboard.press('ArrowUp')
      expect((await activeCell(page)).row).toBe(row - 1)
      const covered = await page.evaluate(() => {
        const cell = (document.activeElement as HTMLElement).getBoundingClientRect()
        const head = (document.querySelector('.dataset-table thead') as HTMLElement).getBoundingClientRect()
        return cell.top < head.bottom - 1
      })
      expect(covered).toBe(false)
    })

    test('Ctrl+End reaches the last loaded row, outside the rendered range', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'keyboard-rows', schema: [{ key: 'n', type: 'integer' }] })).data
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, Array.from({ length: 300 }, (_, n) => ({ n })))
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const renderedRows = await page.locator('.dataset-table tbody tr').count()
      await page.locator('.dataset-table td[data-row="1"][data-col="0"]').focus()

      await page.keyboard.press('Control+End')
      await expect.poll(async () => (await activeCell(page)).row).toBeGreaterThan(renderedRows)
      expect((await activeCell(page)).isCell).toBe(true)
    })
  })
})
