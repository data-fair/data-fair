import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { toolsChangeNote } from '../../../ui/src/composables/agent/url-utils.ts'

// A judged run navigated from the page editor to the page view, where the page form's
// sub-agent does not exist. navigate answered « this page's agent tools are registered and
// callable », the model took its form tools for granted, failed to find them and told the
// person its tools were broken. The note now says what the move added and took away.
test.describe('the tools note of navigate', () => {
  test('names the tools the move took away and the ones it brought', () => {
    const note = toolsChangeNote(['navigate', 'subagent_pageConfig_form'], ['navigate', 'pageFilters_get'])
    assert.match(note, /no longer available here: subagent_pageConfig_form/)
    assert.match(note, /now available: pageFilters_get/)
    assert.doesNotMatch(note, /navigate/)
  })

  test('says when the move changed nothing', () => {
    assert.match(toolsChangeNote(['navigate'], ['navigate']), /same tools as before/)
  })
})
