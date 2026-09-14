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
  captureGateway,
  nextUserMessage, isDone,
  writeEvidence, type Transcript,
  selectCases
} from '@data-fair/lib-agents-sim'

const ASSISTANT_MODEL = process.env.SIM_ASSISTANT_MODEL ?? 'sonnet'
const USER_MODEL = process.env.SIM_USER_MODEL ?? 'haiku'
const selected = selectCases(cases, (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean))

for (const simCase of selected) {
  test(`simulation: ${simCase.name}`, async ({ page, goToWithAuth }) => {
    const started = Date.now()
    const consoleErrors: string[] = []
    let turns = 0
    let error: string | undefined

    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    // The chat iframe POSTs to the agents service's gateway route, so the
    // browser sees the full message array and tool definitions. page.on covers
    // sub-frames, which is why capturing on the top-level page is enough.
    const gateway = captureGateway(page)

    const conversation: Array<{ role: string, text: string }> = []
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
      const composer = root.getByPlaceholder('Tapez votre message...')
      // Unlike the agents repo's _dev pages, where the chat IS the page, data-fair
      // keeps it behind an app-bar toggle. Clicking unconditionally would close a
      // drawer that something else had already opened.
      const alreadyOpen = await composer.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)
      if (!alreadyOpen) {
        await page.locator('.df-agent-chat-toggle').click()
      }
      await composer.waitFor({ state: 'visible', timeout: 30000 })

      const chat = createChatDriver(root, { locale: 'fr' })

      for (let i = 0; i < simCase.maxTurns; i++) {
        const message = await nextUserMessage(simCase, conversation, simCase.maxTurns - i)
        if (isDone(message)) break
        if (message === '') {
          // Distinct from a real stop: the persona subprocess produced no text
          // at all (refusal, swallowed error, empty completion). Recording this
          // as a clean stop would let a judge reason about why the person "left
          // satisfied" when nothing of the sort happened.
          error = `simulated user returned no message (empty completion) on turn ${i + 1}`
          break
        }
        await chat.sendMessage(message)
        await chat.waitForTurn()
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
      consoleErrors
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
