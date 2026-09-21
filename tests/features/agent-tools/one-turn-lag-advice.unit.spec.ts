/**
 * Page-scoped tools are not callable in the request that caused the page (or the
 * dialog) to appear. Every tool result that mentions this must send the model to
 * the same place, because they land in the same request and the model obeys one
 * of them.
 *
 * Both obvious phrasings have now failed in judged runs. "You can now delegate"
 * is false for that request: a run took it literally, found no subagent, and
 * burned a turn on a junk dispatch. "Finish your reply and it will be available
 * on the next turn" is true but deadlocks — there is no next turn when the person
 * is waiting to be told a button is ready — and it drained three runs to the turn
 * cap. In the run after that, `navigate` still carried the second phrasing two
 * calls before an opener carrying the fix, and the model followed the older one.
 *
 * The answer that works is a declared wait: the arrival or the dialog reports
 * itself, the pending transition resolves the wait, and the same turn continues
 * with the tools in scope. Source-level, because these strings are built inline
 * in each tool's execute and nothing else would notice them drifting apart.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sources = {
  navigate: 'ui/src/composables/agent/navigation-tools.ts',
  lineDialogs: 'ui/src/components/dataset/table/dataset-table.vue'
}

/** Only the strings the model reads — comments explain this history at length. */
const codeOf = (path: string) => readFileSync(path, 'utf8')
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n')

test.describe('what a tool result says about the one-turn lag', () => {
  for (const [name, path] of Object.entries(sources)) {
    test(`${name} does not tell the model to wait for a turn that may never come`, () => {
      assert.ok(
        !/finish your reply/i.test(codeOf(path)),
        `${path}: "finish your reply … next turn" deadlocks when the person is waiting to be told a button is ready`
      )
    })

    test(`${name} points at the wait that actually resolves`, () => {
      assert.match(codeOf(path), /declare wait_for_user_action/)
    })
  }

  test('navigate names what resolves the wait, so the advice is checkable', () => {
    // `resolvesWait` in the chat is `!event.key || event.key === LOCATION_KEY`,
    // so arriving somewhere is one of the two things that ends a wait.
    assert.match(codeOf(sources.navigate), /arriving here resolves it/i)
  })

  test('the line dialogs ask for a wait on the save too, not for a report', () => {
    // dataset-line-saved exists precisely so the person is not asked to say
    // "c'est fait" — which two of four user messages were spent on.
    const code = codeOf(sources.lineDialogs)
    assert.match(code, /the save reports itself/)
    assert.ok(!/Dites-moi quand/i.test(code), 'nothing should instruct the model to ask for a click report')
  })
})
