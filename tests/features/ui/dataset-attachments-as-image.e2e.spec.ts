import fs from 'node:fs'
import FormData from 'form-data'
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

test.describe('row attachments as images', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    const dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    datasetId = (await waitForFinalize(ax, dataset.id)).id
  })

  test('is set on the attachments column and swaps the files tab for the thumbnails one', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const exploration = page.locator('#exploration')
    await expect(exploration.getByRole('tab', { name: 'Fichiers' })).toBeVisible({ timeout: 15000 })
    await expect(exploration.getByRole('tab', { name: 'Vignettes' })).not.toBeVisible()

    const structure = page.locator('#structure')
    await structure.getByRole('button', { name: 'attachment', exact: true }).click()
    await structure.getByRole('checkbox', { name: 'Afficher les pièces jointes de lignes comme des images' }).check()
    await structure.getByRole('button', { name: /Enregistrer/ }).click()
    await expect(structure.getByRole('button', { name: /Enregistrer/ })).not.toBeVisible({ timeout: 10000 })

    const ax = await axiosAuth('test_user1@test.com')
    // the image concept moves to _attachment_url, the dataset is reindexed
    await expect.poll(async () => {
      const dataset = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
      return dataset.attachmentsAsImage && dataset.status
    }, { timeout: 30000 }).toBe('finalized')

    await page.reload()
    await expect(exploration.getByRole('tab', { name: 'Vignettes' })).toBeVisible({ timeout: 15000 })
    await expect(exploration.getByRole('tab', { name: 'Fichiers' })).not.toBeVisible()
  })
})
