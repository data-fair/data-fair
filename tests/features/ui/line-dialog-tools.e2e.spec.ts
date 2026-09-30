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
    // Which line is open, so a wrong _id shows in the result instead of in the data.
    expect(edited.text).toContain('nom: Les Amis du Vieux Moulin')
  })

  test('an unknown line _id is refused rather than opened', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const { data: created } = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Registre',
      schema: [{ key: 'nom', type: 'string', title: 'Nom' }]
    })
    await goToWithAuth(`/data-fair/dataset/${created.id}/edit-data`, 'test_user1')
    await expect(page.getByRole('button', { name: /Ajouter une ligne/ })).toBeVisible({ timeout: 15000 })

    const res = await callTool(page, 'open_edit_line_dialog', { lineId: 'no-such-line' })
    expect(res.text).toContain('isError":true')
    expect(res.text).toContain('no-such-line')
    expect(res.registered).toBe(false)
  })

  test('navigate returns once the destination page has registered its tools', async ({ page, goToWithAuth }) => {
    // Its result used to say a destination tool is "not callable in this request"
    // and send the model into a wait on the arrival — whose `location` event had
    // already been delivered inside that very result. A judged run ignored the
    // advice and called open_add_line_dialog on the next step, which worked.
    const ax = await axiosAuth('test_user1@test.com')
    const { data: created } = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'Registre',
      schema: [{ key: 'nom', type: 'string', title: 'Nom' }]
    })
    await goToWithAuth('/data-fair/datasets', 'test_user1')
    await expect.poll(() => page.evaluate(() => (navigator as any).modelContext?.listTools?.().some((t: { name: string }) => t.name === 'navigate')), { timeout: 15000 }).toBe(true)

    const res = await page.evaluate(async (path: string) => {
      const mc = (navigator as any).modelContext
      const result = await mc.executeTool('navigate', { path })
      return { text: JSON.stringify(result), names: mc.listTools().map((t: { name: string }) => t.name) }
    }, `/dataset/${created.id}/edit-data`)
    expect(res.names, res.text).toContain('open_add_line_dialog')
    expect(res.text).not.toMatch(/not callable in this request|declare wait_for_user_action/)
  })
})
