/**
 * One judged scenario per case. There are no assertions about what the
 * assistant should say — the test fails only when the run itself is invalid
 * (the bridge is down, the page did not load, the turn never finished).
 * Whether the product served the person is the judge's call, from the
 * transcript.
 */
import { test } from '../tests/fixtures/login.ts'
import { clean } from '../tests/support/axios.ts'
import { cases } from './cases/index.ts'
import { seedDatasets } from './runner/fixtures.ts'
import { assertBridgeUp, seedSettings, OWNER, OWNER_USER } from './runner/settings.ts'
import {
  createChatDriver,
  chatDriverStrings,
  captureGateway,
  nextUserMessage, isDone,
  writeEvidence, type Transcript,
  selectCases,
  createPagePerception
} from '@data-fair/lib-agents-sim'

const ASSISTANT_MODEL = process.env.SIM_ASSISTANT_MODEL ?? 'sonnet'
// This default must track nextUserMessage's own (persona.ts reads
// process.env.SIM_USER_MODEL ?? 'haiku' itself) — there is no shared export,
// so if upstream changes its default this sidecar value silently goes stale.
// Deliberate duplication, not an oversight.
const USER_MODEL = process.env.SIM_USER_MODEL ?? 'haiku'
const selected = selectCases(cases, (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean))

for (const simCase of selected) {
  test(`simulation: ${simCase.name}`, async ({ page, goToWithAuth }) => {
    const started = Date.now()
    const consoleErrors: string[] = []
    let turns = 0
    let error: string | undefined

    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`))
    // The chat iframe POSTs to the agents service's gateway route, so the
    // browser sees the full message array and tool definitions. page.on covers
    // sub-frames, which is why capturing on the top-level page is enough.
    const gateway = captureGateway(page)

    const conversation: Array<{ role: string, text: string }> = []
    let perception: ReturnType<typeof createPagePerception> | undefined

    // Written up front and overwritten on the way out. A Playwright test timeout
    // aborts the body without running the catch, so without this the previous
    // run's sidecar and verdict would still be on disk and would be read as this
    // run's result — the one thing the sidecar exists to prevent.
    writeEvidence(simCase.name, {
      case: simCase.name,
      goal: simCase.goal,
      persona: simCase.persona,
      route: simCase.route,
      conversation: [],
      gateway: [],
      consoleErrors: [],
      observations: []
    }, {
      case: simCase.name,
      valid: false,
      error: 'run did not complete (timed out or was killed)',
      assistantModel: ASSISTANT_MODEL,
      userModel: USER_MODEL,
      turns: 0,
      durationMs: 0,
      finishedAt: new Date().toISOString()
    })

    try {
      // Setup lives inside the try too: a case that fails to dispatch (bridge
      // down, seeding rejected) must still write an invalid sidecar naming the
      // error, rather than leaving a previous run's evidence on disk to be
      // mistaken for this run's result.
      await assertBridgeUp()
      await clean()
      const ownerAx = await seedDatasets()
      await seedSettings(ASSISTANT_MODEL, ownerAx)

      await goToWithAuth(simCase.route, OWNER_USER, { org: OWNER.id })

      const root = page.frameLocator('iframe')
      // Single source of truth for the composer's locale-dependent strings: the
      // chat driver and the perception's off-limits list must agree on exactly
      // what "the composer" is called, or the guard could miss it.
      const locale = 'fr' as const
      const strings = chatDriverStrings(locale)

      const composer = root.getByPlaceholder(strings.input)
      /**
       * Unlike the agents repo's _dev pages, where the chat IS the page, data-fair
       * keeps it behind an app-bar toggle. Clicking unconditionally would close a
       * drawer that something else had already opened, hence the probe first.
       *
       * Called before every send, not just once at the start: the drawer does not
       * survive a full page navigation, because lib-vuetify-agents' `toggle()`
       * flips the ref without persisting it while only the auto-open path writes
       * `df-agent-chat-open`. So a persona that clicks a link the assistant gave
       * it — the most ordinary thing a person can do — loses the chat. That is the
       * product's behaviour to judge, not the harness's to die on: reopening keeps
       * the run alive so the friction reaches the transcript instead of killing it.
       */
      const ensureChatOpen = async () => {
        const open = await composer.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)
        if (open) return
        await page.locator('.df-agent-chat-toggle').click()
        await composer.waitFor({ state: 'visible', timeout: 30000 })
      }
      await ensureChatOpen()

      const chat = createChatDriver(root, { locale })

      // A person sees the whole viewport, not one frame: data-fair renders the
      // chat in a <d-frame>, so the persona looks at both the host page and the
      // frame.
      // offLimits: the composer belongs to the runner, not the persona. Refusing
      // these names structurally is what stops the persona from typing its
      // message into the page and pressing Send itself, rather than relying on an
      // instruction it is free to ignore. `strings.reset` is off-limits for a
      // different reason: it is not product surface, it is this harness's own
      // recording, and a mid-run click erases the transcript the run exists to
      // produce. Ordinary controls stay reachable — including the drawer toggle,
      // which a real user can and does click.
      perception = createPagePerception(
        [{ label: 'page', root: page }, { label: 'chat panel', root: page.frameLocator('iframe') }],
        { offLimits: [strings.input, strings.send, strings.stop, strings.reset] }
      )

      for (let i = 0; i < simCase.maxTurns; i++) {
        perception.setTurn(i + 1)
        const message = await nextUserMessage(simCase, conversation, simCase.maxTurns - i, { perception })
        if (isDone(message)) break
        if (message === '') {
          // Distinct from a real stop: the persona subprocess produced no text
          // at all (refusal, swallowed error, empty completion). Recording this
          // as a clean stop would let a judge reason about why the person "left
          // satisfied" when nothing of the sort happened.
          error = `simulated user returned no message (empty completion) on turn ${i + 1}`
          break
        }
        // The persona may have navigated the page — or closed the drawer itself —
        // between turns, so re-open before sending rather than assuming the
        // composer survived whatever it just did.
        await ensureChatOpen()
        await chat.sendMessage(message)
        // Explicit ceiling, not the driver's own 10-minute default: 8 turns ×
        // 5 minutes stays inside the 45-minute test budget (see
        // playwright.sim.config.ts), so a wedged turn surfaces as a recorded
        // invalid run rather than an unrecorded test-timeout abort.
        await chat.waitForTurn(5 * 60 * 1000)
        // Read first, then replace: clearing up front means a throw from
        // readConversation leaves the transcript empty, losing every prior turn
        // — and an empty transcript is the one thing a judge cannot judge.
        const read = await chat.readConversation()
        conversation.length = 0
        conversation.push(...read)
        // Counted only once the turn is actually reflected in the transcript,
        // so a throw from sendMessage/waitForTurn/readConversation does not
        // inflate the sidecar's turn count past what the transcript shows.
        turns++
      }

      // A judge cannot judge an empty transcript, and a persona that says DONE
      // on its first message produces one while looking like a clean run.
      if (turns === 0 && !error) error = 'no turns completed — the simulated user stopped before saying anything'
      // Keyed on the transcript, not on `turns`: the first real run completed a
      // turn (turns=1, one gateway exchange) against a stale agents image whose
      // markup predated the classes readConversation matches, so the transcript
      // came back empty while both other guards saw a healthy run. An empty
      // transcript is the one thing a judge cannot judge, however it got that way.
      if (conversation.length === 0 && !error) error = 'transcript is empty — messages were sent but readConversation matched nothing, so the chat markup has probably moved'
      // captureGateway matches browser requests to /v1/chat/completions. Zero
      // exchanges means the capture missed the path entirely, not that the
      // assistant was idle — and the judge, told to look for tools offered but
      // never used, would manufacture friction points out of the silence.
      if (gateway.length === 0 && !error) error = 'no gateway exchanges captured — the chat never reached the agents service, or the capture path changed'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    const transcript: Transcript = {
      case: simCase.name,
      goal: simCase.goal,
      persona: simCase.persona,
      route: simCase.route,
      conversation,
      gateway,
      consoleErrors,
      observations: perception?.observations ?? []
    }
    // `valid` is derived, never hardcoded: the sidecar exists to tell a run that
    // really happened apart from one that fell over, so that reportCases says
    // "invalid (…)" instead of re-reporting the previous run's verdict.
    writeEvidence(simCase.name, transcript, {
      case: simCase.name,
      valid: !error,
      error,
      assistantModel: ASSISTANT_MODEL,
      userModel: USER_MODEL,
      turns,
      durationMs: Date.now() - started,
      finishedAt: new Date().toISOString()
    })

    // An invalid run must never be judged, so surface it as a test failure.
    if (error) throw new Error(`run invalid: ${error}`)
  })
}
