import { test as base, expect } from '../../fixtures/login.ts'
import { clean } from '../../support/axios.ts'

const test = base.extend<{ goToAsAdmin: (path: string) => Promise<void> }>({
  goToAsAdmin: async ({ goToWithAuth }, use) => {
    await use(path => goToWithAuth(path, 'test_superadmin', { adminMode: true }))
  }
})

test.describe('remote-services pages', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('displays remote services list page', async ({ page, goToAsAdmin }) => {
    await goToAsAdmin('/data-fair/remote-services')
    await expect(page.getByText('Cet espace vous permet de gérer les services Web')).toBeVisible({ timeout: 10000 })
  })
})
