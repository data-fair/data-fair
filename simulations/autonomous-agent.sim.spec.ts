/**
 * One judged scenario per autonomous-agent case: an agent of test_org1, acting as its own NHI, on the
 * mcp server's tools (simulations/cases/autonomous-agents.ts). There are no assertions about what the
 * agent should say — the test fails only when the run itself is invalid (the bridge is down, the
 * agent cannot reach its tools, the turn never finished, the premise did not hold). Whether the person
 * was served is the judge's call, from the transcript and the conversation export.
 *
 * A spec of its own rather than a branch of simulate.sim.spec.ts: the chat is the agents page itself
 * here, not the back-office drawer, and the run is set up around a seeded agent.
 */
import { test } from '../tests/fixtures/login.ts'
import { clean } from '../tests/support/axios.ts'
import { agentCases } from './cases/autonomous-agents.ts'
import { selectOwnCases } from './cases/select.ts'
import { seedDatasets, seedDecoys } from './runner/fixtures.ts'
import { assertBridgeUp, seedSettings, fetchConversationExports, runErrors, OWNER, OWNER_USER, ROOT, CONSENT_COOKIE, CONSENT_YES } from './runner/settings.ts'
import { seedAutonomousAgent, assertAgentTools } from './runner/autonomous-agent.ts'
import {
  createChatDriver,
  nextUserMessage, isDone, resolveUserModel,
  writeEvidence, type TranscriptInput, parseConversationExport,
  createPagePerception
} from '@data-fair/lib-agents-sim'

// Same ceiling and models as simulate.sim.spec.ts, for the same reasons (see there).
const TURN_CEILING_MS = 5 * 60 * 1000
const ASSISTANT_MODEL = process.env.SIM_ASSISTANT_MODEL ?? 'sonnet'
const TOOLS_MODEL = process.env.SIM_TOOLS_MODEL ?? 'haiku'
const USER_MODEL = resolveUserModel()
/** The tools every case needs: a run without them would test nothing. */
const REQUIRED_TOOLS = ['datafair_list_account_datasets', 'datafair_describe_dataset', 'datafair_search_data']
const selected = selectOwnCases(agentCases)

for (const simCase of selected) {
  test(`simulation: ${simCase.name}`, async ({ page, goToWithAuth }) => {
    const started = Date.now()
    const consoleErrors: string[] = []
    const user = simCase.user ?? OWNER_USER
    let turns = 0
    let error: string | undefined

    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`))
    // Consent answered up front: the run is read back through the conversation export, which only
    // covers threads the person agreed to have reviewed.
    await page.context().addCookies([{ name: CONSENT_COOKIE, value: CONSENT_YES, url: ROOT }])

    const conversation: Array<{ role: string, text: string }> = []
    let perception: ReturnType<typeof createPagePerception> | undefined

    // Written up front and overwritten on the way out: a test timeout aborts the body without
    // running the catch, and a previous run's evidence must never be read as this run's.
    writeEvidence(simCase.name, {
      case: simCase.name,
      goal: simCase.goal,
      persona: simCase.persona,
      route: simCase.route,
      conversation: [],
      consoleErrors: [],
      observations: [],
      exports: []
    }, {
      case: simCase.name,
      valid: false,
      error: 'run did not complete (timed out or was killed)',
      assistantModel: ASSISTANT_MODEL,
      toolsModel: TOOLS_MODEL,
      userModel: USER_MODEL,
      turns: 0,
      durationMs: 0,
      finishedAt: new Date().toISOString()
    })

    try {
      // Setup inside the try: a case that fails to dispatch must still write an invalid sidecar
      // naming the error.
      await assertBridgeUp()
      await clean()
      const ownerAx = await seedDatasets()
      await seedDecoys()
      await seedSettings(ASSISTANT_MODEL, TOOLS_MODEL, ownerAx)
      await seedAutonomousAgent(simCase.agent)
      await assertAgentTools(REQUIRED_TOOLS)

      // Into the agent's organization: a role is resolved against the session's active account.
      await goToWithAuth(simCase.route, user, { org: OWNER.id })
      // The chat IS the page here, so the driver works on the page itself.
      const chat = createChatDriver(page, { locale: 'fr' })
      await chat.prepare()
      // offLimits: the composer belongs to the runner, not the persona (see simulate.sim.spec.ts).
      perception = createPagePerception([{ label: 'page', root: page }], { offLimits: chat.offLimits })

      // Set when the agent ended a turn by declaring wait_for_user_action: it handed control to the
      // person, who only exists inside nextUserMessage — so the next pass is where they act on it.
      let handedOver = false

      for (let i = 0; i < simCase.maxTurns; i++) {
        perception.setTurn(i + 1)
        const message = await nextUserMessage(simCase, conversation, simCase.maxTurns - i, { perception })
        if (handedOver) {
          handedOver = (await chat.waitForTurn(TURN_CEILING_MS)) === 'waiting'
          const resumed = await chat.readConversation()
          const changed = resumed.length !== conversation.length
          conversation.length = 0
          conversation.push(...resumed)
          if (changed) continue
        }
        if (isDone(message)) break
        if (message === '') {
          // the persona produced no text at all: not a clean stop
          error = `simulated user returned no message (empty completion) on turn ${i + 1}`
          break
        }
        await chat.sendMessage(message, { readyTimeoutMs: TURN_CEILING_MS })
        handedOver = (await chat.waitForTurn(TURN_CEILING_MS)) === 'waiting'
        // read first, then replace: a throw from readConversation must not empty the transcript
        const read = await chat.readConversation()
        conversation.length = 0
        conversation.push(...read)
        turns++
      }

      if (turns === 0 && !error) error = 'no turns completed — the simulated user stopped before saying anything'
      if (conversation.length === 0 && !error) error = 'transcript is empty — messages were sent but readConversation matched nothing, so the chat markup has probably moved'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    // Outside the try, so an invalid run still carries whatever the agent managed to do. Evidence
    // gathering never turns a good run into a failed one.
    let exports: TranscriptInput['exports'] = []
    const evidenceErrors: string[] = []
    try {
      exports = await fetchConversationExports(OWNER, user)
    } catch (err) {
      evidenceErrors.push(`could not export the run's conversations: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!error && !evidenceErrors.length && exports.length === 0) error = 'no conversation was exported — the chat never reached the agents service, or traces are not stored'

    try {
      const parsed = exports.map(parseConversationExport)
      // a provider failure overrides everything else: every other symptom is downstream of it
      const failures = runErrors(parsed)
      if (failures.length) error = `provider or run error (run is not judgeable): ${failures[0]}`
      // a run that never reached the situation its case is about tested nothing: invalid, not judged
      else if (!error && simCase.premise && !simCase.premise.holds(parsed)) error = `premise not met: ${simCase.premise.description}`
    } catch (err) {
      evidenceErrors.push(`could not read the exports: ${err instanceof Error ? err.message : String(err)}`)
    }

    const transcript: TranscriptInput = {
      case: simCase.name,
      goal: simCase.goal,
      persona: simCase.persona,
      route: simCase.route,
      conversation,
      consoleErrors,
      observations: perception?.observations ?? [],
      exports,
      ...(evidenceErrors.length ? { evidenceErrors } : {})
    }
    writeEvidence(simCase.name, transcript, {
      case: simCase.name,
      valid: !error,
      error,
      assistantModel: ASSISTANT_MODEL,
      toolsModel: TOOLS_MODEL,
      userModel: USER_MODEL,
      turns,
      durationMs: Date.now() - started,
      finishedAt: new Date().toISOString()
    })

    // An invalid run must never be judged, so surface it as a test failure.
    if (error) throw new Error(`run invalid: ${error}`)
  })
}
