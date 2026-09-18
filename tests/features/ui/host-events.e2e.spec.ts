import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'

/**
 * What this application PUBLISHES to the assistant, asserted at the channel
 * rather than through the chat.
 *
 * The consumer lives in the agents service (a separate image), so testing this
 * through a conversation would couple a data-fair regression net to which
 * version of that image happens to be deployed. The contract data-fair owns is
 * "the right events reach the tab's BroadcastChannel", and that is what these
 * tests hold.
 *
 * The collector is installed with addInitScript so it is in place before any
 * application code runs — `location` is published on mount, and a listener
 * attached after load would miss it. Fixing the channel id there too is what
 * lets the test know which channel to listen on (getTabChannelId reads it).
 */

const CHANNEL = 'e2e-host-events'

type HostEvent = { name: string, detail?: string, key?: string, at: number }

const collectEvents = `
  sessionStorage.setItem('mcpTabChannelId', ${JSON.stringify(CHANNEL)})
  window.__hostEvents = []
  const channel = new BroadcastChannel(${JSON.stringify(CHANNEL)})
  channel.onmessage = (event) => { window.__hostEvents.push(event.data) }
`

const readEvents = async (page: any): Promise<HostEvent[]> => {
  const messages = await page.evaluate('window.__hostEvents ?? []') as Array<{ type: string, event?: HostEvent }>
  return messages.filter(m => m.type === 'agent-event' && m.event).map(m => m.event as HostEvent)
}

/**
 * The wizard's own next/create button, scoped to the stepper's actions.
 *
 * Unscoped, /Ignorer/ also matched the dismiss icon on every error notification
 * stacked in the corner — five of them after a flaky API, and the click failed on
 * strict mode instead of on anything this test is about.
 */
const wizardAction = (page: any, name: RegExp) =>
  page.locator('.v-stepper-actions').getByRole('button', { name })

/** The last value published for a keyed state, parsed back from its detail. */
const lastKeyed = (events: HostEvent[], key: string) => {
  const keyed = events.filter(e => e.key === key)
  const last = keyed[keyed.length - 1]
  return last?.detail ? JSON.parse(last.detail) : undefined
}

test.describe('host events published to the assistant', () => {
  test.beforeEach(async () => {
    await clean()
    // The agent chat is off by default; the state is only published when it is on.
    const ax = await axiosAuth('test_user1@test.com')
    await ax.patch('/api/v1/settings/user/test_user1', { agentChat: true })
  })

  test('the layout publishes where the user is, and republishes it on navigation', async ({ page, goToWithAuth }) => {
    await page.addInitScript(collectEvents)
    await goToWithAuth('/data-fair/datasets', 'test_user1')

    await expect.poll(async () => lastKeyed(await readEvents(page), 'location')?.path, { timeout: 15000 })
      .toBe('/datasets')

    // A route change must re-publish by itself — that is what replaced the
    // assistant having to call a tool to find out where it is.
    await page.goto('/data-fair/new-dataset')
    await expect.poll(async () => lastKeyed(await readEvents(page), 'location')?.path, { timeout: 15000 })
      .toBe('/new-dataset')

    const location = lastKeyed(await readEvents(page), 'location')
    expect(location.url).toContain('/data-fair/new-dataset')
    expect(location.name).toBeTruthy()
  })

  test('the dataset wizard tells the assistant how it works, once, on arrival', async ({ page, goToWithAuth }) => {
    // Keyed, so it reaches an assistant that navigated here itself — the only
    // channel used to be the action button's hidden context, and every judged run
    // arrived by navigate — and reaches a chat that opens later, via activation.
    // On the channel a keyed state appears once at mount and once more per
    // `agent-state-request` (a chat opening asks every publisher to re-emit); the
    // chat keeps one value per key. What must never happen is a re-emission on a
    // step change: the guidance is constant, so it must not ride along on refreshes.
    await page.addInitScript(collectEvents)
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')
    const guidanceEvents = async () => (await readEvents(page)).filter(e => e.key === 'wizard-guidance')
    const stateRequests = async () => ((await page.evaluate('window.__hostEvents ?? []')) as Array<{ type: string }>).filter(m => m.type === 'agent-state-request').length
    await expect.poll(async () => (await guidanceEvents()).length, { timeout: 15000 }).toBeGreaterThanOrEqual(1)

    const first = (await guidanceEvents())[0].detail!
    expect(first).toContain('wait_for_user_action')
    expect(first).toContain('add_columns')
    expect(first).not.toContain('[truncated]')
    for (const e of await guidanceEvents()) expect(e.detail).toBe(first)
    // Settle the chat's own re-emission handshake before counting.
    await page.waitForTimeout(1500)
    const before = (await guidanceEvents()).length
    expect(before).toBe(1 + await stateRequests())

    // Drive two steps: the wizard state refreshes, the guidance does not.
    const restCard = page.locator('.v-card-title', { hasText: 'Éditable' })
    await expect(restCard).toBeVisible({ timeout: 10000 })
    await restCard.click()
    await wizardAction(page, /Ignorer/).click()
    await expect.poll(async () => lastKeyed(await readEvents(page), 'wizard')?.step, { timeout: 15000 }).toBe('params')
    expect((await guidanceEvents()).length).toBe(before)
  })

  test('the dataset wizard publishes what it holds, and reports the creation before redirecting', async ({ page, goToWithAuth }) => {
    await page.addInitScript(collectEvents)
    await goToWithAuth('/data-fair/new-dataset', 'test_user1')

    const restCard = page.locator('.v-card-title', { hasText: 'Éditable' })
    await expect(restCard).toBeVisible({ timeout: 10000 })
    await restCard.click()
    await wizardAction(page, /Ignorer/).click()
    await page.getByLabel(/Titre du jeu de données/).fill('Demandes de subvention')
    await page.getByLabel(/Conserver un historique complet/).check()

    await expect.poll(async () => lastKeyed(await readEvents(page), 'wizard')?.title, { timeout: 15000 })
      .toBe('Demandes de subvention')

    const wizard = lastKeyed(await readEvents(page), 'wizard')
    expect(wizard.type).toBe('rest')
    expect(wizard.history).toBe(true)
    // An option that belongs to another type must not be reported at all.
    expect('file' in wizard).toBe(false)

    await wizardAction(page, /Continuer/).click()
    // `ready` is the one field that tells the assistant the person can press the
    // button now. It turns true only once the confirmation step's conflict check
    // (an API call) has come back, so it must be seen to arrive before any click.
    await expect.poll(async () => lastKeyed(await readEvents(page), 'wizard')?.ready, { timeout: 15000 }).toBe(true)
    await wizardAction(page, /Créer le jeu de données/).click()
    await expect(page).toHaveURL(/\/dataset\//, { timeout: 30000 })

    // Emitted before the redirect: the wizard unmounts on it and withdraws its
    // state, so this is the last moment it can report the creation.
    const created = (await readEvents(page)).find(e => e.name === 'dataset-created')
    expect(created, 'no dataset-created event was published').toBeTruthy()
    const detail = JSON.parse(created!.detail!)
    expect(detail.title).toBe('Demandes de subvention')
    expect(detail.type).toBe('rest')
    expect(detail.id).toBeTruthy()

    // Pressing Create must not report the form as no longer ready. It used to: `ready`
    // folded in `!createAction.loading`, so the click itself published
    // `ready:false`, and the chat's keyed coalescing (last value wins) replaced the
    // `true` the assistant had never yet been handed. A judged run then showed the
    // model "ready:false" as the state at the very moment of creation, and no
    // ready:true anywhere in its record — while the person's own look showed an
    // enabled Create button. Ready means "complete and submittable from here", not
    // "not currently submitting".
    const wizardEvents = (await readEvents(page)).filter(e => e.key === 'wizard').map(e => JSON.parse(e.detail!))
    const firstReady = wizardEvents.findIndex(w => w.ready === true)
    expect(firstReady, 'ready:true was never published').toBeGreaterThanOrEqual(0)
    const regressed = wizardEvents.slice(firstReady).filter(w => w.ready === false)
    expect(regressed, 'the click reported the form as not ready').toEqual([])
  })
})
