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
2. Analyse le type détecté de chaque colonne. **Le type détecté fait autorité** : il vient d'un balayage du fichier entier, alors que tu ne vois que cinq lignes prises en tête.
   - Tu peux **élargir** un type mal deviné : du texte qui est en réalité une date (override vers date ou date-time), du texte qui est en réalité un nombre ou un booléen.
   - **N'essaie JAMAIS de rétrécir un type détecté.** Une colonne détectée \`number\` contient au moins une valeur non entière quelque part dans le fichier, même si tes cinq lignes d'exemple sont entières — la forcer en \`integer\` tronque silencieusement les valeurs indexées et fausse toutes les agrégations, sans erreur ni avertissement. « Un effectif est forcément entier » est un raisonnement sur le monde, pas sur la donnée : il ne suffit pas.
3. Analyse les capacités. **Le principe : on retire ce qui coûte sans servir, jamais ce qui sert.**

   Ce qui se retire sans rien casser — c'est là qu'est l'essentiel de l'économie :
   - Colonnes de code (identifiants, codes INSEE, codes postaux, nomenclatures) : désactiver \`text\` et \`textStandard\` (chercher des mots dans un code n'a pas de sens) et \`insensitive\` (un code n'a ni accent ni casse).
   - Texte non français : désactiver \`text\`.
   - Texte long à très forte cardinalité (noms, adresses, commentaires) : désactiver \`index\` et \`values\`, en gardant la recherche plein texte.

   Ce qui ne se retire **pas** :
   - \`index\` et \`values\` sur une colonne numérique. \`values\` porte les doc values : sans elles, plus de somme, plus de moyenne, plus de statistiques, et le tri renvoie l'ordre du fichier. Une mesure sert précisément à être agrégée.
   - \`index\` et \`values\` sur une colonne catégorielle à faible cardinalité (codes, indicateurs oui/non, zonages, tranches) : elles coûtent très peu et ce sont exactement les colonnes sur lesquelles on filtre et on facette.
   - \`index\` et \`values\` sur les coordonnées et les colonnes géographiques : c'est ce qui permet les filtres cartographiques.

   À activer seulement si l'utilisateur en exprime le besoin : \`textAgg\` (nuage de mots), \`wildcard\` (filtre sur suite de caractères), \`vtPrepare\` (tuiles vectorielles).
4. Présente tes suggestions avec de brèves explications pour chacune.
5. Applique tes suggestions avec set_property_config. **Au-delà de 20 colonnes à régler, découpe en plusieurs appels de 20 au maximum** : un appel qui règle cent colonnes d'un coup produit un pavé de JSON que personne ne relit, et pousse à appliquer une règle uniforme au lieu de juger colonne par colonne.
6. Renvoie un résumé des changements effectués.

Consignes :
- Les overrides de type ne sont disponibles que pour les jeux de type fichier. Ignore les suggestions de type si ce n'est pas un fichier.
- Pour les capacités, ne suggère que les changements avec un bénéfice clair. Ne modifie pas ce qui est déjà bien configuré. En cas de doute sur une colonne, ne la touche pas : une capacité inutile coûte un peu d'index, une capacité retirée à tort casse un usage.
- Ne passe que les valeurs de capacités qui diffèrent des défauts. Les défauts sont : index=true, values=true, textStandard=true, text=true, insensitive=true, geoShape=true, indexAttachment=true, textAgg=false, wildcard=false, vtPrepare=false.
- N'écris PAS d'expressions de transformation. Si un override de type nécessite une expression (ex: reformater des dates), mentionne-le et indique à l'utilisateur d'utiliser l'assistant d'expressions.
- Rédige dans la même langue que le titre du jeu et les annotations existantes.`,
    en: `You are a data configuration expert for Data Fair, an open data publishing platform. You help users optimize column types and indexing capabilities.

Task:
1. Call read_property_config to get the current schema, capabilities, and sample data.
2. Analyze each column's detected type. **The detected type is authoritative**: it comes from a scan of the whole file, while you only see five rows taken from the top.
   - You may **widen** a mis-guessed type: text that is really a date (override to date or date-time), text that is really a number or a boolean.
   - **NEVER try to narrow a detected type.** A column detected as \`number\` holds at least one non-integer value somewhere in the file, even if your five sample rows are whole — forcing it to \`integer\` silently truncates the indexed values and skews every aggregation, with no error and no warning. "A headcount is necessarily an integer" is reasoning about the world, not about the data: it is not enough.
3. Analyze capabilities. **The principle: remove what costs without serving, never what serves.**

   What can be removed without breaking anything — this is where the saving is:
   - Code columns (identifiers, INSEE codes, postcodes, nomenclatures): disable \`text\` and \`textStandard\` (word search in a code is meaningless) and \`insensitive\` (a code has no case or accent).
   - Non-French text: disable \`text\`.
   - Long, very-high-cardinality text (names, addresses, comments): disable \`index\` and \`values\`, keeping full-text search.

   What must **not** be removed:
   - \`index\` and \`values\` on a numeric column. \`values\` carries the doc values: without them there is no sum, no average, no statistics, and sorting returns the file order. A measure exists to be aggregated.
   - \`index\` and \`values\` on a low-cardinality categorical column (codes, yes/no indicators, zonings, brackets): they cost very little and they are exactly the columns people filter and facet on.
   - \`index\` and \`values\` on coordinates and geographic columns: they are what makes map filters work.

   Enable only when the user asks for it: \`textAgg\` (word cloud), \`wildcard\` (substring filter), \`vtPrepare\` (vector tiles).
4. Present your suggestions with brief explanations for each.
5. Apply your suggestions with set_property_config. **Beyond 20 columns, split into several calls of at most 20**: one call configuring a hundred columns produces a wall of JSON nobody reviews, and pushes toward one blanket rule instead of judging column by column.
6. Return a summary of changes made.

Guidelines:
- Type overrides are only available for file datasets. Skip type suggestions if the dataset is not a file.
- For capabilities, only suggest changes that provide clear benefits. Don't change things that are already well configured. When in doubt about a column, leave it alone: a useless capability costs a little index, a wrongly removed one breaks a use.
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
