import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const virtualNotice = /Lecture seule : ces libellés viennent des jeux enfants/
const extensionNotice = "Lecture seule : ces libellés viennent de l'enrichissement."
const addLabel = 'Associer un libellé à une valeur'

const selectColumn = async (page: Page, title: string) => {
  const columnChip = page.locator('#structure').getByRole('button', { name: title, exact: true })
  await expect(columnChip).toBeVisible({ timeout: 15000 })
  await columnChip.click()
}
const labelsButton = (page: Page) => page.getByRole('button', { name: 'Libellés des valeurs' })
const capabilitiesButton = (page: Page) => page.getByRole('button', { name: 'Configuration technique' })

// consulting must not touch the schema: no pending edit to save, every option disabled
const expectReadonlyCapabilities = async (page: Page, notice: string | RegExp) => {
  await capabilitiesButton(page).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(notice)).toBeVisible()
  const options = dialog.locator('input')
  await expect(options.first()).toBeDisabled()
  for (const option of await options.all()) await expect(option).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0)
}

test.describe('consult value labels (x-labels) of derived columns in the schema tab', () => {
  const childId = 'virtual-labels-child1'
  const slaveId = 'labels-enriched-slave'
  let virtualId: string

  test.beforeAll(async () => {
    test.setTimeout(60000)
    await clean()
    const ax = await axiosAuth('test_user1@test.com')

    // the virtual dataset's schema is derived (labels merged) and cannot be edited directly
    const child = async (id: string, labels: Record<string, string>) => {
      await ax.put(`/api/v1/datasets/${id}`, {
        isRest: true,
        title: id,
        schema: [
          { key: 'id', title: 'Identifiant', type: 'string', 'x-labels': labels },
          { key: 'note', title: 'Note', type: 'string' }
        ]
      })
      await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ id: Object.keys(labels)[0], note: 'n' }])
      await waitForFinalize(ax, id)
    }
    await child(childId, { koumoul: 'Koumoul' })
    await child('virtual-labels-child2', { bidule: 'Bidule' })

    const res = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset with labels',
      virtual: { children: [childId, 'virtual-labels-child2'] },
      schema: [{ key: 'id' }, { key: 'note' }]
    })
    const virtualDataset = await waitForFinalize(ax, res.data.id)
    virtualId = virtualDataset.id
    expect(virtualDataset.schema[0]['x-labels']).toEqual({ koumoul: 'Koumoul', bidule: 'Bidule' })

    // labels of an enriched column come from the master dataset
    const axAdmin = await axiosAuth('test_superadmin@test.com', undefined, true)
    const siret = { key: 'siret', title: 'Siret', type: 'string', 'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret' }
    const masterId = 'labels-enriched-master'
    await axAdmin.put(`/api/v1/datasets/${masterId}`, {
      isRest: true,
      title: masterId,
      schema: [siret, { key: 'statut', title: 'Statut', type: 'string', 'x-labels': { A: 'Actif' } }],
      masterData: { bulkSearchs: [{ id: 'siret', title: 'Par SIRET', input: [{ type: 'equals', property: siret }] }] }
    })
    await axAdmin.post(`/api/v1/datasets/${masterId}/_bulk_lines`, [{ siret: '82898347800011', statut: 'A' }])
    await waitForFinalize(axAdmin, masterId)
    const master = (await axAdmin.get(`/api/v1/datasets/${masterId}`)).data
    await axAdmin.post('/api/v1/_check-api', (await axAdmin.get(master.href + '/api-docs.json')).data)

    await axAdmin.put(`/api/v1/datasets/${slaveId}`, {
      isRest: true,
      title: slaveId,
      schema: [siret],
      extensions: [{ active: true, type: 'remoteService', remoteService: `dataset:${masterId}`, action: 'masterData_bulkSearch_siret', select: ['statut'] }]
    })
    await axAdmin.post(`/api/v1/datasets/${slaveId}/_bulk_lines`, [{ siret: '82898347800011' }])
    const slave = await waitForFinalize(axAdmin, slaveId, 30000)
    expect(slave.schema.find((p: any) => p['x-extension'] && p.title === 'Statut')['x-labels']).toEqual({ A: 'Actif' })
  })

  test('virtual dataset: labels merged from the children open read-only', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1')
    await selectColumn(page, 'Identifiant')
    await labelsButton(page).click()

    await expect(page.getByText(virtualNotice)).toBeVisible()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('cell', { name: 'Koumoul', exact: true })).toBeVisible()
    await expect(dialog.getByRole('cell', { name: 'bidule', exact: true })).toBeVisible()
    await expect(dialog.getByRole('cell', { name: 'Bidule', exact: true })).toBeVisible()
    await expect(page.getByText(addLabel)).not.toBeVisible()
  })

  test('virtual dataset: no labels button on a column without labels', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1')
    await selectColumn(page, 'Note')
    await expect(page.getByLabel('Libellé', { exact: true })).toHaveValue('Note')
    await expect(labelsButton(page)).toHaveCount(0)
  })

  test('enriched column: labels of the master dataset open read-only', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${slaveId}`, 'test_superadmin')
    await selectColumn(page, 'Statut')
    await labelsButton(page).click()

    await expect(page.getByText(extensionNotice)).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('cell', { name: 'Actif', exact: true })).toBeVisible()
    await expect(page.getByText(addLabel)).not.toBeVisible()
  })

  test('virtual dataset: capabilities open read-only', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${virtualId}`, 'test_user1')
    await selectColumn(page, 'Note')
    await expectReadonlyCapabilities(page, /Lecture seule : cette configuration est déduite des jeux enfants/)
  })

  test('enriched column: capabilities open read-only', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${slaveId}`, 'test_superadmin')
    await selectColumn(page, 'Statut')
    await expectReadonlyCapabilities(page, "Lecture seule : cette configuration vient de l'enrichissement.")
  })

  test('plain REST column: capabilities stay editable', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${childId}`, 'test_user1')
    await selectColumn(page, 'Note')
    await capabilitiesButton(page).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Lecture seule/)).not.toBeVisible()
    await expect(dialog.locator('input').first()).toBeEnabled()
  })

  test('plain REST column: labels stay editable', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${childId}`, 'test_user1')
    await selectColumn(page, 'Identifiant')
    await labelsButton(page).click()

    await expect(page.getByText(addLabel)).toBeVisible()
    await expect(page.getByText(/Lecture seule/)).not.toBeVisible()
  })
})
