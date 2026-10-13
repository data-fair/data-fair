// Scripted interactions with the dataset table, each measured over its own span.
// Everything is fixed (paths, counts, query) so runs are comparable.
import type { RunRecord } from './compare.ts'
import { beginSpan, endSpan, settle, type Instrumented } from './collect.ts'
import { TABLE_PERF_SEARCH_WORD } from '../../../dev/table-perf-fixture.ts'

export interface UiScenario {
  name: string
  description: string
  run (h: Instrumented, tableUrl: string): Promise<RunRecord>
}

const firstRow = '.dataset-table tbody tr td'

const openTable = async (h: Instrumented, tableUrl: string) => {
  await h.page.goto(tableUrl)
  await h.page.locator(firstRow).first().waitFor({ timeout: 60000 })
  await settle(h)
}

// Vuetify only honors Escape on the top overlay, a flag it sets in a setTimeout
// after opening: let that timer run before pressing Escape
const nextTimer = (h: Instrumented) => h.page.evaluate(() => new Promise(resolve => setTimeout(resolve)))

export const uiScenarios: UiScenario[] = [
  {
    name: 'load',
    description: 'navigation until the first rows are drawn',
    async run (h, tableUrl) {
      const start = await beginSpan(h, true)
      await h.page.goto(tableUrl)
      await h.page.locator(firstRow).first().waitFor({ timeout: 60000 })
      await settle(h)
      return endSpan(h, start)
    }
  },
  {
    name: 'scroll',
    description: 'about 400 rows of wheel scrolling (40 steps of 400px)',
    async run (h, tableUrl) {
      await openTable(h, tableUrl)
      const box = await h.page.locator('.dataset-table').boundingBox()
      if (!box) throw new Error('table not visible')
      await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      const start = await beginSpan(h)
      for (let i = 0; i < 40; i++) {
        await h.page.mouse.wheel(0, 400)
        // the next page is fetched from an intersection callback, a little after the wheel:
        // settling after every step keeps the number of fetches deterministic
        await settle(h)
      }
      // leave the table, so no hovered cell's buttons depend on timing
      await h.page.mouse.move(0, 0)
      await settle(h)
      return endSpan(h, start)
    }
  },
  {
    name: 'search',
    description: `submit the query "${TABLE_PERF_SEARCH_WORD}" until the updated rows are drawn`,
    async run (h, tableUrl) {
      await openTable(h, tableUrl)
      const input = h.page.locator('[role="search"] input').first()
      const start = await beginSpan(h)
      await input.fill(TABLE_PERF_SEARCH_WORD)
      const searched = h.page.waitForResponse(r => r.url().includes('/lines') && r.url().includes(`q=${TABLE_PERF_SEARCH_WORD}`))
      await input.press('Enter')
      await searched
      await settle(h)
      return endSpan(h, start)
    }
  },
  {
    name: 'header-menu',
    description: 'open and close the header menu of the first 10 columns',
    async run (h, tableUrl) {
      await openTable(h, tableUrl)
      // the clickable part of a column header: a <div> inside the <th> menu activator on
      // older versions, a <button> since the accessibility work; .two-lines skips the actions column
      const buttons = h.page.locator('.dataset-table thead th .header-wrapper:has(.two-lines)')
      const menu = h.page.locator('.v-overlay--active.v-menu')
      const start = await beginSpan(h)
      for (let i = 0; i < 10; i++) {
        await buttons.nth(i).click()
        await menu.first().waitFor()
        await nextTimer(h)
        await h.page.keyboard.press('Escape')
        await menu.first().waitFor({ state: 'detached' })
      }
      await settle(h)
      return endSpan(h, start)
    }
  },
  {
    name: 'hover',
    description: 'move the mouse across a block of 10 rows by 10 columns',
    async run (h, tableUrl) {
      await openTable(h, tableUrl)
      const start = await beginSpan(h)
      for (let r = 0; r < 10; r++) {
        const cells = h.page.locator('.dataset-table tbody tr').nth(r).locator('td')
        for (let c = 1; c <= 10; c++) {
          const box = await cells.nth(c).boundingBox()
          if (!box) continue
          await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
        }
      }
      await settle(h)
      return endSpan(h, start)
    }
  }
]
