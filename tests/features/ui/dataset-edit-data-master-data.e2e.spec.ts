// Covers the back-office editable dataset (REST) edit-data form:
//   - the validation dialog exposes the master-data selector when the column has a matching x-refersTo
//   - typing in the autocomplete column queries the master-data singleSearch endpoint
//   - selecting a value triggers /_simulate-extension and pre-fills the extension column in real time
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const siretConcept = 'http://www.datatourisme.fr/ontology/core/1.0/#siret'
const siretProperty = {
  key: 'siret',
  title: 'Siret',
  type: 'string',
  'x-refersTo': siretConcept
}

const denominationProperty = {
  key: 'denomination',
  title: 'Dénomination',
  type: 'string'
}

test.describe('dataset edit-data form: master-data validation + live extension pre-fill', () => {
  const masterId = 'ref-products'
  const slaveId = 'orders'

  test.beforeAll(async () => {
    test.setTimeout(60000)
    await clean()
    const ax = await axiosAuth('test_superadmin@test.com', undefined, true)

    // Master REST dataset: bulkSearch (used by extension) + singleSearch (used by autocomplete).
    await ax.put(`/api/v1/datasets/${masterId}`, {
      isRest: true,
      title: masterId,
      schema: [siretProperty, denominationProperty],
      masterData: {
        bulkSearchs: [{
          id: 'siret',
          title: 'Fetch info by SIRET',
          input: [{ type: 'equals', property: siretProperty }]
        }],
        singleSearchs: [{
          id: 'siret-search',
          title: 'Recherche par SIRET',
          output: siretProperty,
          label: denominationProperty
        }]
      }
    })
    await ax.post(`/api/v1/datasets/${masterId}/_bulk_lines`, [
      { _id: '82898347800011', siret: '82898347800011', denomination: 'KOUMOUL' },
      { _id: '82898347800012', siret: '82898347800012', denomination: 'KOUMOUL ANNEX' }
    ])
    await waitForFinalize(ax, masterId)

    // Register the master apiDoc as a remote service so its actions become available to consumers.
    const master = (await ax.get(`/api/v1/datasets/${masterId}`)).data
    const apiDoc = (await ax.get(master.href + '/api-docs.json')).data
    await ax.post('/api/v1/_check-api', apiDoc)
    const remoteService = (await ax.get(`/api/v1/remote-services/dataset:${masterId}`, { params: { showAll: true } })).data
    const singleSearchAction = remoteService.actions.find((a: any) => a.id === 'masterData_singleSearch_siret-search')
    expect(singleSearchAction, 'singleSearch action must be exposed by the master remote service').toBeTruthy()
    const singleSearchUrl = remoteService.server + singleSearchAction.operation.path

    // Slave REST dataset: extension on bulkSearch + siret column wired to the master singleSearch
    // via x-master / x-fromUrl / x-item* (same shape the new validation dialog produces).
    const siretSlaveProp = {
      ...siretProperty,
      'x-master': {
        id: `dataset:${masterId}--${singleSearchAction.id}`,
        title: singleSearchAction.summary,
        remoteService: remoteService.id,
        action: singleSearchAction.id
      },
      'x-fromUrl': singleSearchUrl + '?q={q}',
      'x-itemKey': 'output',
      'x-itemTitle': 'label',
      'x-itemsProp': 'results'
    }
    await ax.put(`/api/v1/datasets/${slaveId}`, {
      isRest: true,
      title: slaveId,
      schema: [siretSlaveProp],
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['denomination']
      }]
    })
    await waitForFinalize(ax, slaveId, 30000)
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('validation dialog exposes the master selector and edit-data autocomplete pre-fills extension column', async ({ page, goToWithAuth }) => {
    test.setTimeout(60000)

    // ---- Part A: schema editor — validation dialog shows the configured master-data selector ----
    await goToWithAuth(`/data-fair/dataset/${slaveId}`, 'test_superadmin')
    const structure = page.locator('#structure')
    await expect(structure).toBeVisible({ timeout: 15000 })
    await structure.getByRole('tab', { name: /Schéma|Schema/ }).click()

    await structure.getByRole('button', { name: 'Siret', exact: true }).click()
    await structure.getByTitle(/Validation des données/).click()

    const validationDialog = page.getByRole('dialog')
    await expect(validationDialog).toBeVisible({ timeout: 5000 })
    // The configured singleSearch action title is the displayed value of the master-data v-select.
    await expect(validationDialog.getByText('Recherche par SIRET').first()).toBeVisible({ timeout: 5000 })

    // ---- Part B: edit-data — autocomplete + live extension pre-fill in the add-line form ----
    await goToWithAuth(`/data-fair/dataset/${slaveId}/edit-data`, 'test_superadmin')
    const addLineBtn = page.getByTitle('Ajouter une ligne').first()
    await expect(addLineBtn).toBeVisible({ timeout: 15000 })
    await addLineBtn.click()
    const addDialog = page.getByRole('dialog').filter({ hasText: 'Ajouter une ligne' })
    await expect(addDialog).toBeVisible({ timeout: 5000 })

    const siretInput = addDialog.getByLabel('Siret', { exact: false }).first()
    const masterSearchPromise = page.waitForResponse(resp =>
      resp.url().includes(`/datasets/${masterId}/master-data/single-searchs/siret-search`) && resp.status() === 200,
    { timeout: 15000 })
    await siretInput.click()
    await siretInput.fill('828')
    await masterSearchPromise

    // The singleSearch endpoint formats label as "<output> (<label>)" — pick the first matching suggestion.
    const suggestion = page.getByRole('option').filter({ hasText: '82898347800011' }).first()
    await expect(suggestion).toBeVisible({ timeout: 5000 })

    const simulatePromise = page.waitForResponse(resp =>
      resp.url().includes(`/datasets/${slaveId}/_simulate-extension`) && resp.status() === 200,
    { timeout: 15000 })
    await suggestion.click()
    await simulatePromise

    // The extension produces a `_siret.denomination` field titled "Dénomination" — it must be pre-filled
    // in real time (without saving) by the simulate-extension call triggered above.
    const denomField = addDialog.getByLabel(/Dénomination/).first()
    await expect(denomField).toHaveValue(/KOUMOUL/, { timeout: 10000 })
  })
})
