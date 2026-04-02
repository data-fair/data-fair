import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, fetchSampleRows } from '~/composables/agent/utils'
import {
  type PropertyConfig,
  executeReadPropertyConfig,
  executeSetPropertyConfig
} from './agent-property-config-tools-logic'

export {
  getRelevantCapabilities,
  resolveCapabilities,
  diffCapabilities,
  executeReadPropertyConfig,
  executeSetPropertyConfig
} from './agent-property-config-tools-logic'

export type { PropertyConfig } from './agent-property-config-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readPropertyConfig: 'Lire la configuration des colonnes',
    setPropertyConfig: 'Configurer les types et capacités des colonnes',
    propertyConfigAdvisor: 'Optimiser les types et capacités des colonnes',
    propertyConfigAdvisorDesc: 'Analyser le schéma et les données pour suggérer des corrections de types et des optimisations de capacités.'
  },
  en: {
    readPropertyConfig: 'Read column configuration',
    setPropertyConfig: 'Configure column types and capabilities',
    propertyConfigAdvisor: 'Optimize column types and capabilities',
    propertyConfigAdvisorDesc: 'Analyze the schema and data to suggest type corrections and capability optimizations.'
  }
}

export function useAgentPropertyConfigTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  updatePropertyConfig: (configs: PropertyConfig[]) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_property_config',
    description: 'Read the dataset schema with current type overrides, capabilities, and sample data. Returns each column\'s detected type, type override, effective capabilities (with defaults resolved), and which capabilities are relevant for its type.',
    annotations: { title: t('readPropertyConfig'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: () => executeReadPropertyConfig(datasetData.value, fetchSampleRows)
  })

  useAgentTool({
    name: 'set_property_config',
    description: 'Set type overrides and/or capabilities for one or more schema columns. For typeOverride, pass an object with type and optional format, or null to clear. For capabilities, pass an object with only the values that should differ from defaults, or null to reset to defaults.',
    annotations: { title: t('setPropertyConfig') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        configs: {
          type: 'array' as const,
          description: 'Array of property configurations to apply',
          items: {
            type: 'object' as const,
            properties: {
              key: { type: 'string' as const, description: 'The column key' },
              typeOverrideType: { type: 'string' as const, description: 'Override type: string, number, integer, or boolean. Omit to leave unchanged.' },
              typeOverrideFormat: { type: 'string' as const, description: 'Override format: date or date-time (only with type=string). Omit if not needed.' },
              clearTypeOverride: { type: 'boolean' as const, description: 'Set to true to clear any existing type override.' },
              capabilities: {
                type: 'object' as const,
                description: 'Capabilities to set. Pass only values differing from defaults (index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false). Omit to leave unchanged.',
                additionalProperties: { type: 'boolean' as const }
              },
              resetCapabilities: { type: 'boolean' as const, description: 'Set to true to reset capabilities to defaults.' }
            },
            required: ['key'] as const
          }
        }
      },
      required: ['configs'] as const
    },
    execute: (params: any) => executeSetPropertyConfig(params, datasetData.value, updatePropertyConfig)
  })

  const propertyConfigAdvisorPrompts: Record<string, string> = {
    fr: `Tu es un expert en configuration de données pour Data Fair, une plateforme de publication de données ouvertes. Tu aides les utilisateurs à optimiser les types de colonnes et les capacités d'indexation.

Tâche :
1. Appelle read_property_config pour obtenir le schéma actuel, les capacités et des exemples de données.
2. Analyse le type détecté de chaque colonne vs. le contenu réel. Cherche :
   - Des dates stockées comme texte (suggère un override de type vers date ou date-time)
   - Des nombres stockés comme texte (suggère un override vers number ou integer)
   - Des booléens stockés comme texte (suggère un override vers boolean)
   - Des entiers détectés comme nombres (suggère un override vers integer)
3. Analyse les capacités pour des opportunités d'optimisation :
   - Colonnes de texte long : désactiver \`index\` et \`values\` (le filtrage exact et le tri n'ont pas de sens pour du texte long)
   - Texte non français : désactiver \`text\` (l'analyse spécifique au français est inutile)
   - Colonnes où un nuage de mots pourrait être utile : suggérer d'activer \`textAgg\`
   - Codes à faible cardinalité : \`wildcard\` est généralement inutile
   - IDs uniques à haute cardinalité : le tri \`insensitive\` peut être inutile
4. Présente tes suggestions avec de brèves explications pour chacune.
5. Appelle set_property_config avec toutes les suggestions en une fois.
6. Renvoie un résumé des changements effectués.

Consignes :
- Les overrides de type ne sont disponibles que pour les jeux de type fichier. Ignore les suggestions de type si ce n'est pas un fichier.
- Pour les capacités, ne suggère que les changements avec un bénéfice clair. Ne modifie pas ce qui est déjà bien configuré.
- Ne passe que les valeurs de capacités qui diffèrent des défauts. Les défauts sont : index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false.
- N'écris PAS d'expressions de transformation. Si un override de type nécessite une expression (ex: reformater des dates), mentionne-le et indique à l'utilisateur d'utiliser l'assistant d'expressions.
- Rédige dans la même langue que le titre du jeu et les annotations existantes.`,
    en: `You are a data configuration expert for Data Fair, an open data publishing platform. You help users optimize column types and indexing capabilities.

Task:
1. Call read_property_config to get the current schema, capabilities, and sample data.
2. Analyze each column's detected type vs. actual data content. Look for:
   - Dates stored as plain strings (suggest type override to date or date-time)
   - Numbers stored as strings (suggest type override to number or integer)
   - Booleans stored as strings (suggest type override to boolean)
   - Integers detected as numbers (suggest type override to integer)
3. Analyze capabilities for optimization opportunities:
   - Long text columns: disable \`index\` and \`values\` (exact match filtering and sorting are meaningless for long text)
   - Non-French text: disable \`text\` (French-specific analysis is wasteful)
   - Columns where word cloud/word stats may be useful: suggest enabling \`textAgg\`
   - Low-cardinality codes: \`wildcard\` is usually unnecessary
   - High-cardinality unique IDs: \`insensitive\` sort may be unnecessary
4. Present your suggestions with brief explanations for each.
5. Call set_property_config with all suggestions at once.
6. Return a summary of changes made.

Guidelines:
- Type overrides are only available for file datasets. Skip type suggestions if the dataset is not a file.
- For capabilities, only suggest changes that provide clear benefits. Don't change things that are already well configured.
- Only pass capabilities values that differ from defaults. The defaults are: index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false.
- Do NOT write transform expressions. If a type override needs an expression (e.g., reformatting dates), mention it and tell the user to use the expression helper.
- Write in the same language as the dataset title and existing annotations.`
  }

  useAgentSubAgent({
    name: 'property_config_advisor',
    title: t('propertyConfigAdvisor'),
    description: t('propertyConfigAdvisorDesc'),
    model: 'summarizer',
    prompt: propertyConfigAdvisorPrompts[locale.value] ?? propertyConfigAdvisorPrompts.en,
    tools: ['read_property_config', 'set_property_config']
  })
}
