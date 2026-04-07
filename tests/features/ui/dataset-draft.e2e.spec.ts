import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'
import fs from 'fs-extra'
import FormData from 'form-data'

/**
 * Create a dataset in draft mode (file-new) via API.
 * Returns the dataset object with draftReason.key === 'file-new'.
 */
async function createFileNewDraft (ax: any) {
  const form = new FormData()
  form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
  const res = await ax.post('/api/v1/datasets', form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
    params: { draft: true }
  })
  return waitForFinalizedPolling(ax, res.data.id, { draft: true })
}

/**
 * Poll until a dataset reaches finalized status.
 */
async function waitForFinalizedPolling (ax: any, datasetId: string, params?: any, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const dataset = (await ax.get(`/api/v1/datasets/${datasetId}`, params ? { params } : undefined)).data
    if (dataset.status === 'finalized') return dataset
    if (dataset.status === 'error') throw new Error(`Dataset ${datasetId} is in error state: ${JSON.stringify(dataset.statusMeta)}`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const dataset = (await ax.get(`/api/v1/datasets/${datasetId}`, params ? { params } : undefined)).data
  if (dataset.status === 'finalized') return dataset
  throw new Error(`Dataset ${datasetId} did not finalize within ${timeoutMs}ms, last status: ${dataset.status}`)
}

/**
 * Create a finalized dataset then upload a new file to produce a file-updated draft.
 * Returns the dataset object with draftReason.key === 'file-updated'.
 */
async function createFileUpdatedDraft (ax: any) {
  const dataset = await sendDataset('datasets/dataset1.csv', ax)

  // Upload a new file as draft
  const form2 = new FormData()
  form2.append('file', fs.readFileSync('./tests/resources/datasets/dataset2.csv'), 'dataset2.csv')
  await ax.post('/api/v1/datasets/' + dataset.id, form2, {
    headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() },
    params: { draft: true }
  })
  // Poll until the DRAFT reaches finalized status (WS events can be missed due to race conditions)
  return waitForFinalizedPolling(ax, dataset.id, { draft: true })
}

test.describe('dataset draft mode - file-new', () => {
  let datasetId: string

  test.beforeAll(async () => {
    test.setTimeout(60000)
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await createFileNewDraft(ax)
    datasetId = dataset.id
  })

  test('shows draft banner with file-new message', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.getByText(/créé en mode brouillon|created in draft mode/)).toBeVisible({ timeout: 15000 })
  })

  test('shows data and schema tabs but not applications tab', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).not.toBeVisible()
  })

  test('hides share section', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#share')).not.toBeVisible()
  })

  test('shows activity section', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#activity')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()
  })

  test('shows metadata section with editable form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#metadata').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()
  })

  test('shows validate draft button but not cancel draft button', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.getByRole('button', { name: /Valider le brouillon|Validate the draft/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Annuler le brouillon|Cancel the draft/ })).not.toBeVisible()
  })

  test('metadata section is accessible in draft mode', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#metadata').getByRole('tab', { name: /Détails|Details/ })).toBeVisible()
  })
})

test.describe('dataset draft mode - file-updated', () => {
  let datasetId: string

  test.beforeAll(async () => {
    test.setTimeout(90000)
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await createFileUpdatedDraft(ax)
    datasetId = dataset.id
  })

  test('shows draft banner with file-updated message', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.getByText(/passé en mode brouillon|switched to draft mode/)).toBeVisible({ timeout: 15000 })
  })

  test('shows data, schema and applications tabs', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()
  })

  test('shows share section', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#share')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#share').getByRole('tab', { name: /Permissions/ })).toBeVisible()
  })

  test('shows activity section', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#activity')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()
  })

  test('shows metadata section with editable form', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#metadata').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()
  })

  test('shows both validate and cancel draft buttons', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.getByRole('button', { name: /Valider le brouillon|Validate the draft/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Annuler le brouillon|Cancel the draft/ })).toBeVisible()
  })

  test('metadata section is accessible in draft mode', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#metadata').getByRole('tab', { name: /Détails|Details/ })).toBeVisible()
  })
})

test.describe('dataset draft mode - normal dataset (no draft) regression check', () => {
  let datasetId: string

  test.beforeAll(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('shows all sections: exploration, share, activity', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
  })

  test('shows all data tabs including applications', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()
  })

  test('no draft banner is shown', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await expect(page.locator('#metadata')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/créé en mode brouillon|created in draft mode/)).not.toBeVisible()
    await expect(page.getByText(/passé en mode brouillon|switched to draft mode/)).not.toBeVisible()
  })
})
