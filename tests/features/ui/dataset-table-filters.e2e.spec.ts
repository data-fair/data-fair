import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.describe('dataset table column filters', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = (await ax.post('/api/v1/datasets/table-filters', {
      isRest: true,
      title: 'table-filters',
      schema: [
        { key: 'label', type: 'string' },
        // how prepareSchema configures a textarea/markdown column: analyzed text only
        { key: 'bio', type: 'string', 'x-capabilities': { index: false, values: false, insensitive: false } }
      ]
    })).data
    datasetId = dataset.id
    await ax.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, [{ label: 'with', bio: 'une biographie' }, { label: 'without' }])
    await waitForFinalize(ax, datasetId)
  })

  // a long text column has no exact-value index, but its existence is still filterable through the
  // analyzed sub-field, so the menu must keep offering it (see resolveExistsFields in the API)
  test('a text-only column still offers the "is defined" filters', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}/table`, 'test_user1')
    await expect(page.locator('.dataset-table')).toBeAttached({ timeout: 15000 })
    await page.locator('#header-bio').click()
    await page.getByRole('listitem').filter({ hasText: 'Ajouter un filtre' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Est défini' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr').first()).toContainText('une biographie')
  })
})
