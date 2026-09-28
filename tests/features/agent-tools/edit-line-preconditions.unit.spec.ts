/**
 * open_add_line_dialog used to succeed on any dataset and answer "you can now
 * delegate to the editLine_form subagent to fill in the form fields" — on a
 * freshly created REST dataset whose schema held only the calculated
 * `_updatedAt`. A judged run watched the assistant take that invitation, spend
 * two sub-agent round trips learning the form was empty, and hand the person a
 * manual six-column procedure they had never asked for. The dialog cannot create
 * columns; opening it with none to fill only leads there.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { fillableColumns, addLineDialogPrecondition, hasLineFormSubAgent, lineDialogOpenedResult } from '../../../ui/src/composables/dataset/agent-edit-line-logic.ts'

const updatedAt = { 'x-calculated': true, key: '_updatedAt', type: 'string', title: 'Date de mise à jour' }
const nom = { key: 'nom', type: 'string', title: 'Nom' }

test.describe('fillableColumns', () => {
  test('excludes the calculated system columns a REST dataset always carries', () => {
    assert.deepEqual(fillableColumns([updatedAt, { 'x-calculated': true, key: '_updatedBy', type: 'string' }]), [])
  })

  test('keeps the columns a person actually types into', () => {
    assert.deepEqual(fillableColumns([updatedAt, nom]).map(c => c.key), ['nom'])
  })

  test('treats a missing schema as having nothing to fill', () => {
    assert.deepEqual(fillableColumns(undefined), [])
  })
})

test.describe('addLineDialogPrecondition', () => {
  test('lets the dialog open when there is something to fill', () => {
    assert.equal(addLineDialogPrecondition([updatedAt, nom]), undefined)
  })

  test('refuses on a fresh REST dataset, and says where columns come from', () => {
    const why = addLineDialogPrecondition([updatedAt])!
    assert.ok(why, 'must refuse')
    assert.match(why, /no columns/i)
    assert.match(why, /Structure/, 'must name where the person adds them')
    // The model must not read this as success and go on to delegate.
    assert.ok(!/delegate|editLine_form|opened\./.test(why), why)
  })

  test('refuses on no schema at all', () => {
    assert.ok(addLineDialogPrecondition(undefined))
  })
})

test.describe('line dialog opener results', () => {
  test('recognise the form subagent in a modelContext tool list', () => {
    assert.equal(hasLineFormSubAgent([{ name: 'open_add_line_dialog' }, { name: 'subagent_editLine_form' }]), true)
    assert.equal(hasLineFormSubAgent([{ name: 'open_add_line_dialog' }]), false)
    // listTools() is synchronous on the frame server; anything else is not ready.
    assert.equal(hasLineFormSubAgent(undefined), false)
    assert.equal(hasLineFormSubAgent(Promise.resolve([])), false)
  })

  test('a ready form sends the model straight to the subagent, not into a wait', () => {
    // A wait on the dialog's own opening stalled a real session: the event was
    // delivered inside this very result, leaving the wait nothing to resolve on.
    for (const mode of ['add', 'edit'] as const) {
      const text = lineDialogOpenedResult(mode, true)
      assert.match(text, /delegate to the editLine_form subagent now/)
      assert.match(text, /declare wait_for_user_action: the save reports itself/)
      assert.ok(!/not in the tool list|dialog will report itself/.test(text), text)
    }
  })

  test('a form still loading says so and offers a re-check', () => {
    assert.match(lineDialogOpenedResult('add', false), /not available yet\. Call open_add_line_dialog again/)
    assert.match(lineDialogOpenedResult('edit', false), /open_edit_line_dialog with the same lineId again/)
    assert.ok(!/delegate/.test(lineDialogOpenedResult('add', false)))
  })
})
