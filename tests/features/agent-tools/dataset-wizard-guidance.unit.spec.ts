/**
 * The wizard guidance travels as a keyed host-state detail, which is placed
 * verbatim in a line-oriented block and truncated past 1000 characters. These
 * pin the two things that would silently break it: growing past the cap, and
 * losing the two sentences the judged runs showed it needs.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { DATASET_WIZARD_GUIDANCE, DATASET_WIZARD_GUIDANCE_KEY } from '../../../ui/src/composables/dataset/agent-dataset-wizard-logic.ts'

test.describe('DATASET_WIZARD_GUIDANCE', () => {
  test('fits a host-state detail, on one line', () => {
    assert.ok(DATASET_WIZARD_GUIDANCE.length <= 1000, `${DATASET_WIZARD_GUIDANCE.length} chars`)
    assert.ok(!DATASET_WIZARD_GUIDANCE.includes('\n'))
  })

  test('says to declare the wait before handing over Create', () => {
    assert.match(DATASET_WIZARD_GUIDANCE, /wait_for_user_action/)
    assert.match(DATASET_WIZARD_GUIDANCE, /presses Create themselves/)
  })

  test('says what comes after creation, so no column step gets invented', () => {
    assert.match(DATASET_WIZARD_GUIDANCE, /no columns yet/)
    assert.match(DATASET_WIZARD_GUIDANCE, /dataset page/)
  })

  test('names the tool that declares those columns', () => {
    // Without it the guidance sent the agent to a page and left it to describe a
    // procedure, which is what every judged run ended on.
    assert.match(DATASET_WIZARD_GUIDANCE, /add_columns/)
    assert.match(DATASET_WIZARD_GUIDANCE, /Enregistrer/)
  })

  test('does not read as a route, and does not send the person looking', () => {
    // It used to say "open its page, Structure > Schéma", and a judged run took
    // that literally twice over: it navigated to /dataset/{id}/edit-schema, which
    // does not exist, and then told a person who had said they would not explore
    // the screen to go and find the tab and check the columns. They refused.
    assert.ok(!DATASET_WIZARD_GUIDANCE.includes('>'), 'a "X > Y" path reads as a route to the model')
    assert.match(DATASET_WIZARD_GUIDANCE, /do not send them looking/i)
  })

  test('names every wizard tool and every type', () => {
    for (const t of ['select_dataset_type', 'set_dataset_title', 'set_rest_options', 'skip_init_from_step', 'advance_to_confirmation']) assert.ok(DATASET_WIZARD_GUIDANCE.includes(t), t)
    for (const ty of ['file', 'rest', 'virtual', 'metaOnly']) assert.ok(DATASET_WIZARD_GUIDANCE.includes(ty), ty)
    assert.equal(DATASET_WIZARD_GUIDANCE_KEY, 'wizard-guidance')
  })
})
