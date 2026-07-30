import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'
import { buildGuidance, type GuidedSections } from '~/composables/agent/page-guidance'

export type { GuidedTab, GuidedSection, GuidedSections } from '~/composables/agent/page-guidance'

const messages: Record<string, Record<string, string>> = {
  fr: { pageGuidance: 'Guide de la page' },
  en: { pageGuidance: 'Page guide' }
}

// Always-on description, read on every turn. Keep concise; the rich content
// is in the returned guide, called on demand when the agent is unsure.
const description =
  'Page guide for the dataset detail page — registered only while the user ' +
  'is viewing that page, so its presence in your tool list signals the ' +
  'current location. Returns the page structure (sections, tabs, and agent ' +
  'help buttons not in the global tool list). Call only when unsure how to ' +
  'help the user here; if another tool obviously fits the need, use it.'

export function useAgentDatasetPageGuidance (locale: Ref<string>, sections: Ref<GuidedSections>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'page_guidance',
    description,
    annotations: { title: t('pageGuidance'), readOnlyHint: true },
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => ({
      content: [{
        type: 'text' as const,
        text: buildGuidance(
          'Dataset detail page',
          'Collapsible sections; some have tabs. Only sections and tabs currently visible to this user are listed.',
          sections.value
        )
      }]
    })
  })
}
