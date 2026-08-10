import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

// A fresh browser context's very first cross-page goto right after the simple-directory
// login redirect can occasionally net::ERR_ABORTED (same class of first-navigation race
// tests/fixtures/login.ts's own stale-cache branch already retries around) — retry once,
// this is not a page issue.
async function goToWithAuthResilient (goToWithAuth: (url: string, user: string, opts?: any) => Promise<void>, url: string, user: string, opts?: any) {
  try {
    await goToWithAuth(url, user, opts)
  } catch (err: any) {
    if (!String(err?.message ?? err).includes('ERR_ABORTED')) throw err
    await goToWithAuth(url, user, opts)
  }
}

test.describe('members access audit page', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const visible = (await ax.post('/api/v1/datasets', { isRest: true, title: 'Audit visible dataset' })).data
    await ax.put(`/api/v1/datasets/${visible.id}/permissions`, [{ type: 'user', id: 'test_user8', classes: ['list', 'read'] }])
    await ax.post('/api/v1/datasets', { isRest: true, title: 'Audit hidden dataset' })
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('the page is not available to a contrib', async ({ page, goToWithAuth }) => {
    await goToWithAuthResilient(goToWithAuth, '/data-fair/members-access', 'test_user5', { org: 'test_org1' })
    await expect(page.getByText(/réservée aux administrateurs/)).toBeVisible()
  })

  test('an org admin audits a member', async ({ page, goToWithAuth }) => {
    await goToWithAuthResilient(goToWithAuth, '/data-fair/members-access', 'test_user1', { org: 'test_org1' })
    // pick the member (member-select queries simple-directory from 3 typed chars)
    await page.getByRole('combobox').first().locator('input').fill('user8')
    await page.getByRole('option', { name: /user8/i }).click()
    await page.waitForURL(/member=/)
    // only the explicitly shared dataset is listed, with its capability chip
    await expect(page.getByText('Audit visible dataset')).toBeVisible()
    await expect(page.getByText('Audit hidden dataset')).toBeHidden()
    await expect(page.getByText('Lecture', { exact: true })).toBeVisible()
    // the capability filter narrows the list
    await page.locator('.v-select').filter({ hasText: 'Capacité' }).click()
    await page.getByRole('option', { name: 'Écriture', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Audit visible dataset')).toBeHidden()
  })
})
