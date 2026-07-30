import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildGuidance, type GuidedSections } from '../../../ui/src/composables/agent/page-guidance.ts'

test.describe('buildGuidance', () => {
  test('renders heading, intro, sections and tabs that have an agentDesc', () => {
    const sections: GuidedSections = {
      a: { title: 'Section A', agentDesc: 'Does A.' },
      b: {
        title: 'Section B',
        tabs: [
          { key: 't1', title: 'Tab 1', agentDesc: 'Tab one.' },
          { key: 't2', title: 'Tab 2' }
        ]
      }
    }
    const out = buildGuidance('My page', 'Intro line.', sections)
    assert.ok(out.startsWith('# My page\n\nIntro line.\n'))
    assert.ok(out.includes('## Section A'))
    assert.ok(out.includes('Does A.'))
    assert.ok(out.includes('## Section B'))
    assert.ok(out.includes('- **Tab 1** — Tab one.'))
    assert.ok(!out.includes('Tab 2'))
  })

  test('skips sections with neither agentDesc nor described tabs', () => {
    const sections: GuidedSections = { a: { title: 'Empty' } }
    const out = buildGuidance('P', 'I.', sections)
    assert.ok(!out.includes('## Empty'))
  })
})
