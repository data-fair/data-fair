/**
 * The application wizard's guidance existed only as the action button's
 * hidden-context — where the dataset wizard's was before it was published as
 * keyed state. Every judged run so far reached a wizard by navigating there
 * itself, never by pressing that button, so the button's context is a channel
 * nobody uses: the assistant drove on tool descriptions alone, which is what had
 * it invent steps the dataset wizard does not have.
 *
 * Same contract as DATASET_WIZARD_GUIDANCE: one line, under the host-state
 * detail cap, naming the tools and who presses the last button.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { APPLICATION_WIZARD_GUIDANCE, APPLICATION_WIZARD_GUIDANCE_KEY } from '../../../ui/src/composables/application/agent-application-wizard-logic.ts'

test.describe('APPLICATION_WIZARD_GUIDANCE', () => {
  test('fits a host-state detail, on one line', () => {
    assert.ok(APPLICATION_WIZARD_GUIDANCE.length <= 1000, `${APPLICATION_WIZARD_GUIDANCE.length} chars`)
    assert.ok(!APPLICATION_WIZARD_GUIDANCE.includes('\n'))
  })

  test('shares the dataset wizard key, which only one page can hold at a time', () => {
    // Deliberate: the chat keeps one value per key and only one of the two
    // wizards is ever mounted, so a stale guidance cannot outlive its page.
    assert.equal(APPLICATION_WIZARD_GUIDANCE_KEY, 'wizard-guidance')
  })

  test('names every wizard tool', () => {
    for (const tool of ['list_base_applications', 'select_creation_type', 'select_base_application', 'select_copy_application', 'set_application_title']) {
      assert.ok(APPLICATION_WIZARD_GUIDANCE.includes(tool), tool)
    }
  })

  test('says the person presses the last button, and to wait for it', () => {
    assert.match(APPLICATION_WIZARD_GUIDANCE, /wait_for_user_action/)
    assert.match(APPLICATION_WIZARD_GUIDANCE, /themselves/)
  })

  test('says where the dataset it starts from is to be found', () => {
    // /new-application?dataset=<id>. The location state already publishes the
    // query, so the guidance points at it rather than duplicating the id into a
    // second state that would then have to be kept in step.
    assert.match(APPLICATION_WIZARD_GUIDANCE, /dataset/)
    assert.match(APPLICATION_WIZARD_GUIDANCE, /query/)
  })

  test('does not read as a route, and does not send the person looking', () => {
    assert.ok(!APPLICATION_WIZARD_GUIDANCE.includes('>'), 'a "X > Y" path reads as a route to the model')
    assert.match(APPLICATION_WIZARD_GUIDANCE, /do not send them looking/i)
  })
})
