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
    // but it is no Tab stop: Enter in the field already submits
    await searchLandmark.locator('input').focus()
    await page.keyboard.press('Tab')
    await expect(submit).not.toBeFocused()
    await expect(searchLandmark.locator('input')).not.toBeFocused()
    // nor does an empty element catch it (the filters bar, with no filter)
    expect(await page.evaluate(() => document.activeElement!.getBoundingClientRect().height)).toBeGreaterThan(0)
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
    await menu.getByRole('listitem').filter({ hasText: /tri ascendant|ascending sort/i }).click()
    // picking a sort closes the menu
    await expect(menu).toHaveCount(0)
    await expect(page.locator('thead th[aria-sort="ascending"]')).toHaveCount(1)
    await expect(page.locator('thead th[aria-sort]')).toHaveCount(1)
    // Vuetify ignores activator clicks for 50ms after a menu closes (reopenLock in
    // useActivator), a human can't click again that fast but the test can
    await page.waitForTimeout(100)
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

    test('Enter on a cell with a single control activates it', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = await sendDataset('datasets/dataset1.csv', ax)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'adr')
      const cell = page.locator(`.dataset-table td[data-row="1"][data-col="${col}"]`)
      await cell.focus()

      // a focused cell shows the buttons a mouse hover shows, its only one filters on Enter
      const filterButton = cell.getByRole('button', { name: /filtrer|filter/i })
      await expect(filterButton).toBeVisible()
      // F2 only reaches it
      await page.keyboard.press('F2')
      await expect(filterButton).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(cell).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(1)
      // focus stays in the table, on the same cell
      await expect.poll(() => activeCell(page)).toMatchObject({ isCell: true, row: 1, col })
    })

    test('each chip of a multi-valued cell filters from the keyboard', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'keyboard-chips', schema: [{ key: 'tags', type: 'string', separator: ',' }] })).data
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ tags: 'rouge,vert' }, { tags: 'vert' }, { tags: 'bleu' }])
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'tags')
      const row = await page.locator('.dataset-table tbody tr').filter({ hasText: 'rouge' }).locator('td').first().getAttribute('data-row')
      const cell = page.locator(`.dataset-table td[data-row="${row}"][data-col="${col}"]`)
      // the chips add no Tab stop of their own, the table stays a single one
      await expect(page.locator('.dataset-table tbody [tabindex="0"]')).toHaveCount(1)
      await cell.focus()

      // a cell with several controls: Enter reaches the first one, Escape returns to the cell,
      // Tab goes to the next chip, Enter filters on the focused chip
      await page.keyboard.press('Enter')
      await expect(cell.locator('.v-chip').first()).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(cell).toBeFocused()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      const second = cell.locator('.v-chip').nth(1)
      await expect(second).toBeFocused()
      await expect(second).toHaveText('vert')
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(2)

      // the filters bar is no Tab stop of its own, Tab goes from the search field to the filter
      await page.locator('[role="search"] input').first().focus()
      await page.keyboard.press('Tab')
      await expect(page.locator('.dataset-filters .v-chip').first()).toBeFocused()

      // the filtered chip removes its filter the same way
      const filteredCell = page.locator(`.dataset-table td[data-row="${await page.locator('.dataset-table tbody tr').filter({ hasText: 'rouge' }).locator('td').first().getAttribute('data-row')}"][data-col="${col}"]`)
      await filteredCell.focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      await expect(filteredCell.locator('.v-chip').nth(1)).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(3)
    })

    test('a number filter keeps its formatted label, and the cell removes it the way it added it', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'keyboard-numbers', schema: [{ key: 'n', type: 'integer' }] })).data
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ n: 10000 }, { n: 20000 }, { n: 10000 }])
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'n')
      const cellWith = async (text: RegExp) => page.locator(`.dataset-table td[data-row="${await page.locator('.dataset-table tbody tr').filter({ hasText: text }).first().locator('td').first().getAttribute('data-row')}"][data-col="${col}"]`)
      const filterChip = page.locator('.dataset-filters .v-chip')

      const cell = await cellWith(/10\s000/)
      await cell.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(2)
      await expect(page).toHaveURL(/n_eq=10000/)
      // the label stays formatted once the filter went through the URL
      await expect(filterChip).toHaveText(/10\s000/)
      await expect(filterChip).not.toHaveText(/10000/)

      // the filtered value offers to remove the filter, not to add it again
      const filtered = await cellWith(/10\s000/)
      await filtered.focus()
      await expect(filtered.getByRole('button', { name: /filtrer|filter the/i })).toHaveCount(0)
      await expect(filtered.getByRole('button', { name: /retirer le filtre|remove the filter/i })).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(3)
      await expect(filterChip).toHaveCount(0)

      // with the mouse: the pointer stays on the cell after the click, it offers the removal at once
      const hoveredCell = await cellWith(/10\s000/)
      await hoveredCell.hover()
      await hoveredCell.getByRole('button', { name: /filtrer|filter the/i }).click()
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(2)
      await expect(page.locator('.dataset-table tbody td').filter({ hasText: /10\s000/ }).first().getByRole('button', { name: /retirer le filtre|remove the filter/i })).toBeVisible()
      await page.locator('.dataset-table tbody td').filter({ hasText: /10\s000/ }).first().getByRole('button', { name: /retirer le filtre|remove the filter/i }).click()
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(3)

      // a filter read from the URL gets the same label and the same remove button
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table?n_eq=10000`, 'test_user1')
      await expect(page.locator('.dataset-table tbody tr')).toHaveCount(2)
      await expect(filterChip).toHaveText(/10\s000/)
      const reloaded = await cellWith(/10\s000/)
      await reloaded.focus()
      await expect(reloaded.getByRole('button', { name: /retirer le filtre|remove the filter/i })).toBeVisible()
    })

    test('a truncated value only offers its full value, Enter shows it', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'keyboard-long', schema: [{ key: 'txt', type: 'string' }] })).data
      const long = 'mot '.repeat(80) + 'fin'
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ txt: long }, { txt: 'court' }])
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const col = await colOf(page, 'txt')
      const row = await page.locator('.dataset-table tbody tr').filter({ hasText: 'mot' }).locator('td').first().getAttribute('data-row')
      const cell = page.locator(`.dataset-table td[data-row="${row}"][data-col="${col}"]`)
      await cell.focus()

      // a value long enough to be truncated is no useful filter (and too long for an exact one)
      await expect(cell.getByRole('button', { name: /entière|full value/i })).toBeVisible()
      await expect(cell.getByRole('button', { name: /filtrer|filter the/i })).toHaveCount(0)
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog').getByText(/fin$/)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect.poll(() => activeCell(page)).toMatchObject({ inTable: true, row: Number(row), col })

      // the same from the focused button
      await cell.focus()
      await page.keyboard.press('F2')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog').getByText(/fin$/)).toBeVisible()
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

  test.describe('column selector', () => {
    const openSelector = async (page: any) => {
      const button = page.getByRole('button', { name: /choisir les colonnes|chose visible columns/i })
      await button.focus()
      await page.keyboard.press('Enter')
      const menu = page.getByRole('menu')
      await expect(menu).toBeVisible()
      return menu
    }
    const focused = (page: any) => page.evaluate(() => {
      const a = document.activeElement as HTMLElement
      return { role: a.getAttribute('role'), name: a.textContent?.trim(), checked: a.getAttribute('aria-checked'), outline: getComputedStyle(a).outlineStyle }
    })

    test('arrows move between the columns, Space toggles one, the focus is visible (7.3 / 10.7)', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = await sendDataset('datasets/dataset1.csv', ax)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      await openSelector(page)

      await page.keyboard.press('ArrowDown')
      const first = await focused(page)
      expect(first).toMatchObject({ role: 'menuitemcheckbox', checked: 'false' })
      expect(first.outline).not.toBe('none')
      await page.keyboard.press('ArrowDown')
      const second = await focused(page)
      expect(second.role).toBe('menuitemcheckbox')
      expect(second.name).not.toBe(first.name)

      // checking columns shows only the checked ones
      await page.keyboard.press('Space')
      expect((await focused(page)).checked).toBe('true')
      await expect(page.locator('.dataset-table thead th').filter({ hasText: second.name })).toHaveCount(1)
      await expect(page.locator('.dataset-table thead th').filter({ hasText: first.name })).toHaveCount(0)
      await page.keyboard.press('ArrowUp')
      expect((await focused(page)).name).toBe(first.name)

      // Escape closes the menu and gives the focus back to its button
      await page.keyboard.press('Escape')
      await expect(page.getByRole('menu')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /choisir les colonnes|chose visible columns/i })).toBeFocused()
    })

    test('a group folds and unfolds with the arrows, Space toggles all its columns', async ({ page, goToWithAuth }) => {
      const ax = await axiosAuth('test_user1@test.com')
      const dataset = (await ax.post('/api/v1/datasets', {
        isRest: true,
        title: 'keyboard-groups',
        schema: [{ key: 'a', type: 'string', 'x-group': 'G' }, { key: 'b', type: 'string', 'x-group': 'G' }, { key: 'c', type: 'string' }]
      })).data
      await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ a: 'x', b: 'y', c: 'z' }])
      await waitForFinalize(ax, dataset.id)
      await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
      await expect(page.locator('.dataset-table tbody td').first()).toBeVisible({ timeout: 15000 })
      const menu = await openSelector(page)

      await page.keyboard.press('ArrowDown')
      expect(await focused(page)).toMatchObject({ name: 'G', checked: 'false' })
      await expect(menu.getByRole('menuitemcheckbox', { name: 'a', exact: true })).toHaveCount(0)
      await page.keyboard.press('ArrowRight')
      await expect(menu.getByRole('menuitemcheckbox', { name: 'a', exact: true })).toBeVisible()
      await page.keyboard.press('ArrowDown')
      expect((await focused(page)).name).toBe('a')
      // from a column of the group, ArrowLeft goes back to the group, then folds it
      await page.keyboard.press('ArrowLeft')
      expect((await focused(page)).name).toBe('G')
      await page.keyboard.press('ArrowLeft')
      await expect(menu.getByRole('menuitemcheckbox', { name: 'a', exact: true })).toHaveCount(0)

      await page.keyboard.press('Space')
      expect((await focused(page)).checked).toBe('true')
      await expect(page.locator('.dataset-table thead th').filter({ hasText: /^c$/ })).toHaveCount(0)
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Space')
      // one column of the group left: the group is partly checked
      await page.keyboard.press('ArrowLeft')
      expect((await focused(page)).checked).toBe('mixed')
    })
  })
})
