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

test.describe('access audit page', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const visible = (await ax.post('/api/v1/datasets', { isRest: true, title: 'Audit visible dataset' })).data
    await ax.put(`/api/v1/datasets/${visible.id}/permissions`, [{ type: 'user', id: 'test_user8', classes: ['list', 'read'] }])
    await ax.post('/api/v1/datasets', { isRest: true, title: 'Audit hidden dataset' })
    const publicDs = (await ax.post('/api/v1/datasets', { isRest: true, title: 'Audit public dataset' })).data
    await ax.put(`/api/v1/datasets/${publicDs.id}/permissions`, [{ classes: ['list', 'read'] }])
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('the page is not available to a contrib', async ({ page, goToWithAuth }) => {
    await goToWithAuthResilient(goToWithAuth, '/data-fair/access-audit', 'test_user5', { org: 'test_org1' })
    await expect(page.getByText(/réservée aux administrateurs/)).toBeVisible()
  })

  test('an org admin audits a member', async ({ page, goToWithAuth }) => {
    await goToWithAuthResilient(goToWithAuth, '/data-fair/access-audit', 'test_user1', { org: 'test_org1' })
    await page.locator('.v-select').filter({ hasText: 'Visiteur simulé' }).click()
    await page.getByRole('option', { name: /Un membre de/ }).click()
    // pick the member (member-select queries simple-directory from 3 typed chars)
    await page.getByRole('combobox').filter({ hasText: /Membre de/ }).locator('input').fill('user8')
    await page.getByRole('option', { name: /user8/i }).click()
    await page.waitForURL(/visitor=member(:|%3A)test_user8(:|%3A)/)
    // only the explicitly shared dataset is listed, with its capability chip
    await expect(page.getByText('Audit visible dataset')).toBeVisible()
    await expect(page.getByText('Audit hidden dataset')).toBeHidden()
    await expect(page.getByText('Lecture', { exact: true }).first()).toBeVisible()
    // provenance of the access, in the capability chip's tooltip
    await page.locator('.v-card').filter({ hasText: 'Audit visible dataset' }).locator('.v-chip').filter({ hasText: 'Lecture' }).hover()
    await expect(page.getByText(/Permission pour l'utilisateur .* : Listage, Lecture/)).toBeVisible()
    // the capability filter narrows the list
    await page.locator('.v-select').filter({ hasText: 'Capacité' }).click()
    await page.getByRole('option', { name: 'Écriture', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Audit visible dataset')).toBeHidden()
  })
  test('an org admin audits an anonymous visitor', async ({ page, goToWithAuth }) => {
    await goToWithAuthResilient(goToWithAuth, '/data-fair/access-audit', 'test_user1', { org: 'test_org1' })
    await page.locator('.v-select').filter({ hasText: 'Visiteur simulé' }).click()
    await page.getByRole('option', { name: 'Un visiteur anonyme' }).click()
    await expect(page.getByText('Audit public dataset')).toBeVisible()
    await expect(page.getByText('Audit visible dataset')).toBeHidden()
    await page.locator('.v-card').filter({ hasText: 'Audit public dataset' }).locator('.v-chip').filter({ hasText: 'Lecture' }).hover()
    await expect(page.getByText('Permission publique : Listage, Lecture')).toBeVisible()
  })
})
