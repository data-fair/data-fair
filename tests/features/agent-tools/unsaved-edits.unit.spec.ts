/**
 * Feedback: asked to fill the topics of every dataset in the catalog, the assistant set them
 * on one, navigated to the next and the next, and never noticed nothing had been saved. The
 * pages register their pending edits, and navigate refuses to leave while one is pending.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatUnsavedEditsRefusal, pendingUnsavedEdits, registerUnsavedEdit } from '../../../ui/src/composables/agent/unsaved-edits.ts'

test.describe('unsaved edits registry', () => {
  test('reports only the dirty edits, and forgets an unregistered one', () => {
    let dirty = false
    const unregisterMetadata = registerUnsavedEdit({ label: 'metadata card', isDirty: () => dirty })
    const unregisterStructure = registerUnsavedEdit({ label: 'dataset structure', isDirty: () => false })
    assert.deepEqual(pendingUnsavedEdits(), [])
    dirty = true
    assert.deepEqual(pendingUnsavedEdits(), ['metadata card'])
    unregisterMetadata()
    unregisterStructure()
    assert.deepEqual(pendingUnsavedEdits(), [])
  })

  test('the refusal names the edits and the way out', () => {
    const text = formatUnsavedEditsRefusal(['metadata card'])
    assert.match(text, /\*\*Success\*\*: false/)
    assert.match(text, /metadata card/)
    assert.match(text, /Enregistrer/)
    assert.match(text, /wait_for_user_action/)
  })
})
