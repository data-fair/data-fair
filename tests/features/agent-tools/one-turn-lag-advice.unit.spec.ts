/**
 * Tools that make new page tools appear (navigate, the line dialog openers) now
 * return once those tools are registered, and the chat offers a tool registered
 * while a host tool runs on its very next step. There is no lag left to explain.
 *
 * Every earlier explanation failed in judged or real runs. "Finish your reply and
 * it will be available on the next turn" deadlocked: there is no next turn when
 * the person is waiting to be told a button is ready. "Declare wait_for_user_action,
 * the arrival resolves it" stalled: the arrival's event was delivered inside the
 * opener's own result, so nothing was left to wake the wait — a real session sat
 * on « En attente : Ouverture du formulaire d'ajout de ligne » over an open form.
 * Source-level, because these strings are built inline and nothing else would
 * notice one of them coming back. The registration itself is pinned end to end by
 * tests/features/ui/line-dialog-tools.e2e.spec.ts.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sources = {
  navigate: 'ui/src/composables/agent/navigation-tools.ts',
  lineDialogs: 'ui/src/composables/dataset/agent-edit-line-logic.ts'
}

/** Only the strings the model reads — comments explain this history at length. */
const codeOf = (path: string) => readFileSync(path, 'utf8')
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n')

test.describe('what a tool result says about newly registered tools', () => {
  for (const [name, path] of Object.entries(sources)) {
    test(`${name} does not tell the model to wait for a turn that may never come`, () => {
      assert.ok(!/finish your reply/i.test(codeOf(path)), path)
    })

    test(`${name} does not call the new tools uncallable or send the model into a wait for them`, () => {
      const code = codeOf(path)
      assert.ok(!/not callable in this request|not in the tool list of this request|arriving here resolves it|dialog will report itself/i.test(code), path)
    })
  }

  test('the line dialogs ask for a wait on the save, not for a report', () => {
    // dataset-line-saved exists precisely so the person is not asked to say
    // "c'est fait" — which two of four user messages were spent on.
    const code = codeOf(sources.lineDialogs)
    assert.match(code, /declare wait_for_user_action, its message telling the user to press Enregistrer: the save reports itself/)
    assert.ok(!/Dites-moi quand/i.test(code), 'nothing should instruct the model to ask for a click report')
  })
})
