import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'
import {
  type MetadataContext,
  type MetadataInput,
  buildMetadataPatch,
  formatMetadataContext,
  formatMetadataOutcomes,
  FREQUENCY_VALUES,
  SUMMARY_MAX_LENGTH
} from './agent-metadata-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readDatasetMetadata: 'Lire la fiche du jeu de données',
    setDatasetMetadata: 'Renseigner la fiche du jeu de données'
  },
  en: {
    readDatasetMetadata: 'Read dataset metadata',
    setDatasetMetadata: 'Set dataset metadata'
  }
}

/**
 * Tools for the dataset's metadata card. A single writer for the whole card — title,
 * summary, description, keywords, licence, topics and the optional fields — replaces the
 * former one-tool-per-field pair (`set_dataset_summary`, `set_dataset_description`), so
 * the model has one place to write and one report to read.
 *
 * Nothing is saved: the tool fills the form the user is looking at, every changed field
 * lights up in `dataset-metadata-form.vue`, and the human clicks Enregistrer.
 */
export function useAgentDatasetMetadataTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  applyPatch: (patch: Record<string, any>) => void
) {
  const t = createAgentTranslator(messages, locale)

  const fetchContext = async (): Promise<MetadataContext> => {
    const owner = datasetData.value?.owner
    if (!owner) return { licenses: [], topics: [], datasetsMetadata: null }
    const base = `settings/${owner.type}/${owner.id}`
    // The three lists are independent; a missing one (no permission, none configured)
    // must not sink the whole call — it just narrows what the agent may write.
    const [licenses, topics, datasetsMetadata] = await Promise.all([
      $fetch<any[]>(`${base}/licenses`).catch(() => []),
      $fetch<any[]>(`${base}/topics`).catch(() => []),
      $fetch<Record<string, any>>(`${base}/datasets-metadata`).catch(() => null)
    ])
    return { licenses: licenses ?? [], topics: topics ?? [], datasetsMetadata: datasetsMetadata ?? null }
  }

  useAgentTool({
    name: 'read_dataset_metadata',
    description: 'Read the metadata card of the dataset being edited: current title, summary, description, licence, topics, keywords and optional fields, plus the closed lists of licences and topics this organization allows and which optional fields it has disabled. Call this before set_dataset_metadata so you propose values that exist.',
    annotations: { title: t('readDatasetMetadata'), readOnlyHint: true },
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => {
      if (!datasetData.value) return 'Error: no dataset loaded'
      return formatMetadataContext(datasetData.value, await fetchContext())
    }
  })

  useAgentTool({
    name: 'set_dataset_metadata',
    description: `Fill the metadata card of the dataset currently being edited. Pass only the fields you want to change; omitted fields are left alone. Nothing is saved — the values land in the form, the changed fields are highlighted, and the user reviews them before clicking Enregistrer. Licence and topics must come from the organization's lists (read_dataset_metadata returns them); an unknown value is refused with the allowed list. The summary is capped at ${SUMMARY_MAX_LENGTH} characters.`,
    annotations: { title: t('setDatasetMetadata') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, description: 'Short title of the dataset' },
        summary: { type: 'string' as const, description: `One-sentence summary shown in catalogs, ${SUMMARY_MAX_LENGTH} characters max, plain text, opening on the concrete subject` },
        description: { type: 'string' as const, description: 'Detailed markdown description' },
        keywords: { type: 'array' as const, items: { type: 'string' as const }, description: 'Keywords used for search and catalog facets' },
        license: { type: ['string', 'null'] as const, description: "Licence title or href, from the organization's list; null clears it" },
        topics: { type: 'array' as const, items: { type: 'string' as const }, description: "Topic titles or ids, from the organization's list" },
        origin: { type: 'string' as const, description: 'Where the data comes from (producer, source URL)' },
        creator: { type: 'string' as const, description: 'Person or organization that produced the data' },
        frequency: { type: 'string' as const, enum: FREQUENCY_VALUES as unknown as string[], description: 'Update frequency' },
        spatial: { type: 'string' as const, description: 'Spatial coverage, in words' }
      }
    },
    execute: async (params: MetadataInput) => {
      if (!datasetData.value) return 'Error: no dataset loaded'
      const ctx = await fetchContext()
      const { patch, outcomes } = buildMetadataPatch(params, datasetData.value, ctx)
      if (Object.keys(patch).length) applyPatch(patch)
      return formatMetadataOutcomes(outcomes)
    }
  })
}
