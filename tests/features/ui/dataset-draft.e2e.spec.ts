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

  // Upload a new file as draft — retry on 409 (worker may briefly hold a lock after finalization)
  const form2 = new FormData()
  form2.append('file', fs.readFileSync('./tests/resources/datasets/dataset2.csv'), 'dataset2.csv')
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await ax.post('/api/v1/datasets/' + dataset.id, form2, {
        headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() },
        params: { draft: true }
      })
      break
    } catch (err: any) {
      if (err.response?.status === 409 && attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        throw err
      }
    }
  }
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

  test('file-new draft page shows expected sections, tabs and controls', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')

    // Draft banner with file-new message
    await expect(page.getByText(/créé en mode brouillon|created in draft mode/)).toBeVisible({ timeout: 15000 })

    // Exploration: data and schema tabs, but no applications tab
    await expect(page.locator('#exploration')).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).not.toBeVisible()

    // Share section hidden in file-new draft
    await expect(page.locator('#share')).not.toBeVisible()

    // Activity section with Journal tab
    await expect(page.locator('#activity')).toBeVisible()
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()

    // Metadata section with editable form
    await expect(page.locator('#metadata')).toBeVisible()
    await expect(page.locator('#metadata').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()

    // Validate button present, cancel button absent
    await expect(page.getByRole('button', { name: /Valider le brouillon|Validate the draft/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Annuler le brouillon|Cancel the draft/ })).not.toBeVisible()

    // Dataset details (informations) accessible
    await expect(page.locator('#informations')).toBeVisible()
  })

  // Mutating test last — validates the draft (dataset leaves draft mode)
  test('validate draft publishes the dataset', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const validateBtn = page.getByRole('button', { name: /Valider le brouillon|Validate the draft/ })
    await expect(validateBtn).toBeVisible({ timeout: 15000 })
    await validateBtn.click()
    // After validation the worker processes the dataset; the draft banner should disappear
    await expect(page.getByText(/créé en mode brouillon|created in draft mode/)).not.toBeVisible({ timeout: 30000 })
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

  test('file-updated draft page shows expected sections, tabs and controls', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')

    // Draft banner with file-updated message
    await expect(page.getByText(/passé en mode brouillon|switched to draft mode/)).toBeVisible({ timeout: 15000 })

    // Exploration: data, schema and applications tabs
    await expect(page.locator('#exploration')).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()

    // Share section with Permissions tab
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#share').getByRole('tab', { name: /Permissions/ })).toBeVisible()

    // Activity section with Journal tab
    await expect(page.locator('#activity')).toBeVisible()
    await expect(page.locator('#activity').getByRole('tab', { name: /Journal/ })).toBeVisible()

    // Metadata section with editable form
    await expect(page.locator('#metadata')).toBeVisible()
    await expect(page.locator('#metadata').getByRole('tab', { name: /Informations|Information/ })).toBeVisible()

    // Both validate and cancel buttons present
    await expect(page.getByRole('button', { name: /Valider le brouillon|Validate the draft/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Annuler le brouillon|Cancel the draft/ })).toBeVisible()

    // Dataset details (informations) accessible
    await expect(page.locator('#informations')).toBeVisible()
  })

  // Mutating test last — cancels the draft (dataset reverts to pre-update state)
  test('cancel draft restores dataset to pre-update state', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    const cancelDraftBtn = page.getByRole('button', { name: /Annuler le brouillon|Cancel the draft/ })
    await expect(cancelDraftBtn).toBeVisible({ timeout: 15000 })
    await cancelDraftBtn.click()
    // After cancelling, the draft banner should disappear
    await expect(page.getByText(/passé en mode brouillon|switched to draft mode/)).not.toBeVisible({ timeout: 30000 })
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

  test('published dataset page shows all sections and tabs without draft banner', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')

    // All sections visible
    await expect(page.locator('#exploration')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#share')).toBeVisible()
    await expect(page.locator('#activity')).toBeVisible()
    await expect(page.locator('#metadata')).toBeVisible()

    // All data tabs including applications
    await expect(page.locator('#exploration').getByRole('tab', { name: /Tableau|Table/ })).toBeVisible()
    await expect(page.locator('#structure').getByRole('tab', { name: /Schéma|Schema/ })).toBeVisible()
    await expect(page.locator('#exploration').getByRole('tab', { name: /Applications/ })).toBeVisible()

    // No draft banner in either variant
    await expect(page.getByText(/créé en mode brouillon|created in draft mode/)).not.toBeVisible()
    await expect(page.getByText(/passé en mode brouillon|switched to draft mode/)).not.toBeVisible()
  })
})
