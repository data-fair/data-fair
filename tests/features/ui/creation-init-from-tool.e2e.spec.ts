import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

/**
 * The creation wizard can start a dataset from an existing one; the assistant could only
 * skip that step. Asked for "a new register like this year's", it skipped it, declared the
 * columns by hand after creation (with keys that no longer matched), and the person had a
 * second button to press that the goal had ruled out. init_from_dataset fills the step the
 * way a person's pick does, so the dataset is created with the source's columns.
 *
 * Called through navigator.modelContext, the entry point the chat's frame transport reaches.
 */

const callTool = (page: any, name: string, args: Record<string, unknown> = {}) =>
  page.evaluate(async ({ name, args }: { name: string, args: Record<string, unknown> }) => {
    const result = await (navigator as any).modelContext.executeTool(name, args)
    return JSON.stringify(result)
  }, { name, args })

test.describe('creation wizard agent tools', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    await ax.patch('/api/v1/settings/user/test_user1', { agentChat: true })
  })

  test('init_from_dataset creates the new dataset with the source columns', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const { data: source } = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Registre 2026',
      schema: [{ key: 'association', type: 'string', title: 'Association' }, { key: 'montant', type: 'number', title: 'Montant' }]
    })

    await goToWithAuth('/data-fair/new-dataset', 'test_user1')
    await expect(page.locator('.v-card-title', { hasText: 'Éditable' })).toBeVisible({ timeout: 15000 })

    expect(await callTool(page, 'select_dataset_type', { type: 'rest' })).toContain('init_from_dataset')
    const init = await callTool(page, 'init_from_dataset', { datasetId: source.id })
    expect(init).toContain('Registre 2026')
    expect(init).toContain('schema')
    // shown selected in the init step, like a person's pick
    await page.locator('.v-stepper-item').nth(1).click()
    await expect(page.getByText('Registre 2026').first()).toBeVisible()

    await callTool(page, 'set_dataset_title', { title: 'Registre 2027' })
    expect(await callTool(page, 'advance_to_confirmation')).toContain('ready')
    await page.getByRole('button', { name: /Créer/ }).last().click()
    await page.waitForURL(/\/dataset\/[^/]+$/, { timeout: 20000 })
    const id = page.url().split('/').pop()

    const { data: created } = await ax.get(`/api/v1/datasets/${id}`)
    expect(created.title).toBe('Registre 2027')
    expect(created.schema.filter((p: any) => !p.key.startsWith('_')).map((p: any) => p.key)).toEqual(['association', 'montant'])
  })

  test('init_from_dataset refuses a dataset it cannot read', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')
    await expect(page.locator('.v-card-title', { hasText: 'Éditable' })).toBeVisible({ timeout: 15000 })
    await callTool(page, 'select_dataset_type', { type: 'rest' })
    expect(await callTool(page, 'init_from_dataset', { datasetId: 'nope' })).toContain('list_datasets')
  })
})
