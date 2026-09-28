import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

/**
 * The line dialog openers must not return before the dialog's form subagent
 * exists.
 *
 * The chat makes a tool registered DURING a host tool's execution usable on the
 * very next step, so an opener that waits for `editLine_form` can simply say
 * "delegate now". Returning earlier sent the model into a declared wait on the
 * dialog's own opening event — which, the add form being bundled with its
 * dialog, reached the chat before the opener's result and was delivered inside
 * it, leaving the wait with nothing to resolve it. A real session sat on
 * « En attente : Ouverture du formulaire d'ajout de ligne » over an open form.
 *
 * Called through navigator.modelContext, the same entry point the chat's frame
 * transport reaches, so this holds without an agents service.
 */

const SUBAGENT = 'subagent_editLine_form'

const callTool = (page: any, name: string, args: Record<string, unknown> = {}) =>
  page.evaluate(async ({ name, args, subAgent }: { name: string, args: Record<string, unknown>, subAgent: string }) => {
    const mc = (navigator as any).modelContext
    const result = await mc.executeTool(name, args)
    const registered = mc.listTools().some((t: { name: string }) => t.name === subAgent)
    return { text: JSON.stringify(result), registered }
  }, { name, args, subAgent: SUBAGENT })

test.describe('line dialog agent tools', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await axiosAuth('test_user1@test.com')
    await ax.patch('/api/v1/settings/user/test_user1', { agentChat: true })
  })

  test('opening a line dialog returns once its form subagent is registered', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const { data: created } = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Registre',
      schema: [{ key: 'nom', type: 'string', title: 'Nom' }]
    })
    const { data: line } = await ax.post(`/api/v1/datasets/${created.id}/lines`, { nom: 'Les Amis du Vieux Moulin' })

    await goToWithAuth(`/data-fair/dataset/${created.id}/edit-data`, 'test_user1')
    await expect(page.getByRole('button', { name: /Ajouter une ligne/ })).toBeVisible({ timeout: 15000 })

    const added = await callTool(page, 'open_add_line_dialog')
    expect(added.registered, `returned before ${SUBAGENT} registered: ${added.text}`).toBe(true)
    expect(added.text).toContain('delegate to the editLine_form subagent now')
    expect(added.text).not.toMatch(/declare wait_for_user_action and the dialog/)

    await page.locator('.v-card-actions').getByRole('button', { name: /Annuler/ }).click()
    await expect.poll(() => page.evaluate((subAgent: string) =>
      (navigator as any).modelContext.listTools().some((t: { name: string }) => t.name === subAgent), SUBAGENT), { timeout: 15000 }).toBe(false)

    const edited = await callTool(page, 'open_edit_line_dialog', { lineId: line._id })
    expect(edited.registered, `returned before ${SUBAGENT} registered: ${edited.text}`).toBe(true)
    expect(edited.text).toContain('delegate to the editLine_form subagent now')
  })
})
