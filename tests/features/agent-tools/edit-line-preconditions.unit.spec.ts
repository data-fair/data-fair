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
import { untilStable } from '../../../ui/src/composables/agent/utils-logic.ts'
import { fillableColumns, addLineDialogPrecondition, hasLineFormSubAgent, lineDialogOpenedResult, describeLine } from '../../../ui/src/composables/dataset/agent-edit-line-logic.ts'

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
      assert.match(text, /declare wait_for_user_action, its message telling the user to press Enregistrer: the save reports itself/)
      assert.ok(!/not in the tool list|dialog will report itself/.test(text), text)
    }
  })

  test('a form still loading says so and offers a re-check', () => {
    assert.match(lineDialogOpenedResult('add', false), /not available yet\. Call open_add_line_dialog again/)
    assert.match(lineDialogOpenedResult('edit', false), /open_edit_line_dialog with the same lineId again/)
    assert.ok(!/delegate/.test(lineDialogOpenedResult('add', false)))
  })
})

test.describe('the edit opener names the line it opened', () => {
  // A judged run opened the edit dialog on the line it had just created — the one
  // _id in its context — instead of the one to correct, and the result gave no
  // sign of it. Only the model's own second look saved the wrong record.
  const schema = [updatedAt, nom, { key: 'montant', type: 'number', title: 'Montant' }]

  test('describes a line by its fillable columns, not the system ones', () => {
    assert.equal(describeLine(schema, { _id: 'dem-2', _updatedAt: '2026-01-01', nom: 'Club de judo du centre', montant: 12000 }),
      'nom: Club de judo du centre, montant: 12000')
  })

  test('shortens long values and skips empty ones', () => {
    const text = describeLine(schema, { nom: 'x'.repeat(200), montant: null })
    assert.ok(text.startsWith('nom: xxx'), text)
    assert.ok(text.length < 100, text)
    assert.ok(!text.includes('montant'), text)
  })

  test('the ready edit result carries the description', () => {
    const text = lineDialogOpenedResult('edit', true, 'nom: Club de judo du centre')
    assert.match(text, /on the line nom: Club de judo du centre/)
    assert.match(text, /delegate to the editLine_form subagent now/)
  })
})

test.describe('untilStable', () => {
  test('resolves once the value has stopped changing for the quiet window', async () => {
    let n = 0
    const start = Date.now()
    await untilStable(() => String(n < 3 ? ++n : n), 100, 2000, 20)
    assert.equal(n, 3)
    assert.ok(Date.now() - start < 1000)
  })

  test('gives up at the cap on a value that never settles', async () => {
    let n = 0
    const start = Date.now()
    await untilStable(() => String(++n), 100, 300, 20)
    assert.ok(Date.now() - start >= 280)
  })
})
