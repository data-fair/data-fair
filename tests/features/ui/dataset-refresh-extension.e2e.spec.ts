// Refreshing one extension of a REST dataset (the "Relancer l'enrichissement" button)
// must keep the other extensions and their columns.
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const siretProperty = { key: 'siret', title: 'Siret', type: 'string', 'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret' }
const communeProperty = { key: 'commune', title: 'Code commune', type: 'string', 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeCommune' }

test.describe('dataset extensions: refresh one extension', () => {
  const masterId = 'refresh-ext-master'
  const slaveId = 'refresh-ext-slave'

  test.beforeAll(async () => {
    test.setTimeout(60000)
    await clean()
    const ax = await axiosAuth('test_superadmin@test.com', undefined, true)

    await ax.put(`/api/v1/datasets/${masterId}`, {
      isRest: true,
      title: masterId,
      schema: [siretProperty, communeProperty, { key: 'denomination', type: 'string' }, { key: 'libelle', type: 'string' }],
      masterData: {
        bulkSearchs: [
          { id: 'siret', title: 'Par SIRET', input: [{ type: 'equals', property: siretProperty }] },
          { id: 'commune', title: 'Par commune', input: [{ type: 'equals', property: communeProperty }] }
        ]
      }
    })
    await ax.post(`/api/v1/datasets/${masterId}/_bulk_lines`, [
      { siret: '82898347800011', commune: '56260', denomination: 'KOUMOUL', libelle: 'Vannes' }
    ])
    await waitForFinalize(ax, masterId)
    const master = (await ax.get(`/api/v1/datasets/${masterId}`)).data
    await ax.post('/api/v1/_check-api', (await ax.get(master.href + '/api-docs.json')).data)

    await ax.put(`/api/v1/datasets/${slaveId}`, {
      isRest: true,
      title: slaveId,
      schema: [siretProperty, communeProperty],
      extensions: [
        { active: true, type: 'remoteService', remoteService: `dataset:${masterId}`, action: 'masterData_bulkSearch_siret', select: ['denomination'] },
        { active: true, type: 'remoteService', remoteService: `dataset:${masterId}`, action: 'masterData_bulkSearch_commune', select: ['libelle'] }
      ]
    })
    await ax.post(`/api/v1/datasets/${slaveId}/_bulk_lines`, [{ siret: '82898347800011', commune: '56260' }])
    await waitForFinalize(ax, slaveId, 30000)
  })

  test.afterAll(async () => {
    await checkPendingTasks()
  })

  test('keeps the other extension and its columns', async ({ page, goToWithAuth }) => {
    test.setTimeout(60000)
    const ax = await axiosAuth('test_superadmin@test.com', undefined, true)

    await goToWithAuth(`/data-fair/dataset/${slaveId}`, 'test_superadmin')
    const structure = page.locator('#structure')
    await expect(structure).toBeVisible({ timeout: 15000 })
    await structure.getByRole('tab', { name: /Enrichissements|Extensions/ }).click()

    const patch = page.waitForResponse(resp => resp.url().endsWith(`/datasets/${slaveId}`) && resp.request().method() === 'PATCH')
    await structure.getByTitle("Relancer l'enrichissement").first().click()
    await page.getByRole('button', { name: 'Confirmer' }).click()
    expect((await patch).status()).toBe(200)
    await waitForFinalize(ax, slaveId, 30000)

    const slave = (await ax.get(`/api/v1/datasets/${slaveId}`)).data
    expect(slave.extensions.map((e: any) => e.action)).toEqual(['masterData_bulkSearch_siret', 'masterData_bulkSearch_commune'])
    const line = (await ax.get(`/api/v1/datasets/${slaveId}/lines`)).data.results[0]
    expect(line['_siret.denomination']).toBe('KOUMOUL')
    expect(line['_commune.libelle']).toBe('Vannes')
  })
})
