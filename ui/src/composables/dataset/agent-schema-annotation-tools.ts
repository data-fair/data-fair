import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, toCsv, fetchSampleRows } from '~/composables/agent/utils'
import {
  type SchemaAnnotation,
  type VocabularyTerm,
  applyAnnotations,
  formatAnnotationOutcomes,
  formatVocabulary,
  isEditableColumn
} from './agent-schema-annotation-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    readSchemaForAnnotation: 'Lire le schéma pour annotation',
    annotateSchema: 'Annoter les colonnes du schéma',
    schemaAnnotator: 'Annoter le schéma d\'un jeu de données',
    schemaAnnotatorDesc: 'Lire le schéma et des exemples de données, puis poser libellés, descriptions, concepts et groupes sur les colonnes.'
  },
  en: {
    readSchemaForAnnotation: 'Read schema for annotation',
    annotateSchema: 'Annotate schema columns',
    schemaAnnotator: 'Annotate a dataset schema',
    schemaAnnotatorDesc: 'Read the schema and sample data, then set column titles, descriptions, concepts and groups.'
  }
}

export function useAgentSchemaAnnotationTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  vocabulary: Ref<VocabularyTerm[]>,
  applyToSchema: (mutate: (schema: any[]) => void) => void
) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'read_schema_for_annotation',
    description: 'Read the dataset schema with its current annotations and 5 sample rows, plus the catalogue of concepts that may be assigned. Returns each column\'s key, type, title, description, concept, group, cardinality and whether it already carries value labels.',
    annotations: { title: t('readSchemaForAnnotation'), readOnlyHint: true },
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => {
      const dataset = datasetData.value
      if (!dataset) return 'Error: No dataset loaded'

      const columns = (dataset.schema ?? []).filter(isEditableColumn)
      const rows = columns.map((col: any) => {
        const notes: string[] = []
        if (col['x-originalName'] && col['x-originalName'] !== col.key) notes.push(`source: ${col['x-originalName']}`)
        if (col['x-cardinality']) notes.push(`cardinality: ${col['x-cardinality']}`)
        // Values are deliberately NOT listed here: they belong to the labelling tool, and
        // listing them is what tempts a model into writing them into a description.
        if (col['x-labels']) notes.push(`already has value labels (${Object.keys(col['x-labels']).length})`)
        else if (col.enum?.length) notes.push(`${col.enum.length} distinct value(s) observed — candidate for value labels`)
        return `| \`${col.key}\` | ${col.type}${col.format ? ` (${col.format})` : ''} | ${col.title || '(none)'} | ${col.description ? 'yes' : '(none)'} | ${col['x-concept']?.title ?? (col['x-refersTo'] ? col['x-refersTo'] : '(none)')} | ${col['x-group'] ?? '(none)'} | ${notes.join(' — ')} |`
      })

      let sampleCsv = ''
      if (dataset.id) {
        try {
          const { rows: sample } = await fetchSampleRows(dataset.id, 5)
          sampleCsv = toCsv(sample)
        } catch {
          sampleCsv = '(failed to fetch sample data)'
        }
      }

      const groups = [...new Set((dataset.schema ?? []).map((c: any) => c['x-group']).filter(Boolean))]

      return [
        `# Schema: ${dataset.title}`,
        '',
        '| Key | Type | Title | Description | Concept | Group | Notes |',
        '|-----|------|-------|-------------|---------|-------|-------|',
        ...rows,
        '',
        groups.length ? `## Groups already in use\n${groups.join(', ')}` : '## Groups already in use\n(none)',
        '',
        '## Assignable concepts',
        formatVocabulary(vocabulary.value ?? [], dataset.schema ?? []),
        '',
        '## Sample data (5 rows)',
        sampleCsv
      ].join('\n')
    }
  })

  useAgentTool({
    name: 'annotate_schema',
    description: 'Set the title, description, concept and/or group of one or more columns. Pass only the fields you want to change. Concepts come from the catalogue returned by read_schema_for_annotation and are checked against the same rules as the form: a concept is unique in a dataset and must match the column type. Nothing is saved — the changed columns are highlighted in the schema list and the user clicks Enregistrer. Coded values (1 = male, COM = commune) do NOT go in the description: use set_column_labels.',
    annotations: { title: t('annotateSchema') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        annotations: {
          type: 'array' as const,
          description: 'Column annotations to apply',
          items: {
            type: 'object' as const,
            properties: {
              key: { type: 'string' as const, description: 'The column key' },
              title: { type: 'string' as const, description: 'Short human-readable label, 2 to 5 words' },
              description: { type: 'string' as const, description: 'Only when it adds what the title cannot say. Empty string clears it.' },
              concept: { type: ['string', 'null'] as const, description: 'Concept title, id or identifier from the catalogue; empty string or null clears it' },
              group: { type: ['string', 'null'] as const, description: 'Group name used to fold the schema into sections; empty string or null clears it' }
            },
            required: ['key'] as const
          }
        }
      },
      required: ['annotations'] as const
    },
    execute: (params: { annotations: SchemaAnnotation[] }) => {
      if (!datasetData.value?.schema) return 'Error: No dataset loaded'
      let outcomes: ReturnType<typeof applyAnnotations> = []
      applyToSchema(schema => { outcomes = applyAnnotations(schema, params.annotations, vocabulary.value ?? []) })
      return formatAnnotationOutcomes(outcomes)
    }
  })

  const schemaAnnotatorPrompts: Record<string, string> = {
    fr: `Tu es un expert en documentation de données pour Data Fair, une plateforme de publication de données ouvertes. Tu annotes les colonnes d'un jeu de données pour qu'elles soient lisibles sans documentation externe.

Tâche :
1. Appelle read_schema_for_annotation : schéma courant, exemples de données, concepts assignables.
2. Pour chaque colonne, décide libellé, description, concept et groupe.
3. Appelle annotate_schema avec l'ensemble de tes décisions. **C'est cet appel qui fait le travail** — un rapport sans appel d'outil ne sert à rien.
4. Renvoie comme réponse finale le compte rendu que l'outil t'a retourné, sans le réécrire.

Libellés :
- 2 à 5 mots, capitalisation naturelle ("Montant HT", "Date de naissance")
- corrige un libellé cryptique, absent, ou qui ne fait que répéter la clé technique
- **ne réécris pas un libellé déjà clair** ; passe à la suivante

Descriptions — la règle est restrictive :
- **Une description ne se justifie que si elle dit ce que le libellé ne peut pas dire** : une unité, un mode de calcul, un périmètre, une convention, un piège d'interprétation. Exemples : « Âge en années révolues ; 100 regroupe les 100 ans et plus », « Montant hors taxes, en euros courants ».
- **Si la seule chose que tu peux écrire est une paraphrase du libellé, n'écris rien.** Une colonne « Code postal » n'a pas besoin de « Le code postal ». Laisser vide est un bon résultat.
- **Ne liste JAMAIS les valeurs d'une colonne codée dans sa description.** « COM pour commune, ARM pour arrondissement » est un libellé de valeur, pas une description : c'est le rôle de set_column_labels, et la description deviendrait fausse à la première nouvelle modalité.
- **N'écris rien qui bouge quand la donnée bouge** : ni nombre de valeurs distinctes, ni bornes chiffrées, ni valeurs d'exemple.
- N'écrase pas une description existante qui respecte déjà ces règles.

Concepts :
- N'assigne que des concepts du catalogue retourné par l'outil. Ils enrichissent le traitement de la donnée (jointures territoriales, cartographie, filtres partagés).
- Un concept ne sert qu'une fois par jeu de données, et son type doit correspondre à celui de la colonne. L'outil refuse le reste, avec la raison.
- Dans le doute, ne mets pas de concept : un mauvais concept est pire que pas de concept.

Groupes :
- N'utilise les groupes que si le jeu a assez de colonnes pour que le repliement aide (au-delà d'une quinzaine).
- Réutilise les groupes déjà en place plutôt que d'en inventer des synonymes.
- Des noms courts et évidents : « Identification », « Adresse », « Géolocalisation », « Mesures ». Toute colonne d'un même sujet dans le même groupe.

Rédige dans la langue du titre et des annotations existantes du jeu.`,
    en: `You are a data documentation expert for Data Fair, an open data publishing platform. You annotate a dataset's columns so they can be read without external documentation.

Task:
1. Call read_schema_for_annotation: current schema, sample data, assignable concepts.
2. For each column decide on a title, a description, a concept and a group.
3. Call annotate_schema with all your decisions. **That call is the work** — a report with no tool call achieves nothing.
4. Return the tool's report as your final answer, without rewriting it.

Titles:
- 2 to 5 words, natural capitalization ("Net amount", "Date of birth")
- fix a cryptic, missing, or key-repeating title
- **do not rewrite a title that is already clear**; move on

Descriptions — the rule is restrictive:
- **A description is only justified when it says what the title cannot**: a unit, a computation, a scope, a convention, an interpretation trap. E.g. "Age in completed years; 100 groups everyone aged 100 and over", "Amount excluding tax, in current euros".
- **If all you can write is a paraphrase of the title, write nothing.** A "Postal code" column does not need "The postal code". Leaving it empty is a good outcome.
- **NEVER list a coded column's values in its description.** "COM for municipality, ARM for borough" is a value label, not a description: that is what set_column_labels is for, and the description would go stale at the first new modality.
- **Write nothing that moves when the data moves**: no distinct-value count, no numeric bounds, no sample values.
- Do not overwrite an existing description that already follows these rules.

Concepts:
- Only assign concepts from the catalogue the tool returns. They drive data processing — territorial joins, mapping, shared filters.
- A concept is used once per dataset and its type must match the column's. The tool refuses the rest, with the reason.
- When in doubt, assign none: a wrong concept is worse than no concept.

Groups:
- Only use groups when the dataset has enough columns for folding to help (beyond fifteen or so).
- Reuse the groups already in place rather than inventing synonyms.
- Short, obvious names: "Identification", "Address", "Geolocation", "Measures". Every column on one subject in one group.

Write in the language of the dataset title and existing annotations.`
  }

  useAgentSubAgent({
    name: 'schema_annotator',
    title: t('schemaAnnotator'),
    description: t('schemaAnnotatorDesc'),
    model: 'summarizer',
    prompt: schemaAnnotatorPrompts[locale.value] ?? schemaAnnotatorPrompts.en,
    tools: ['read_schema_for_annotation', 'annotate_schema']
  })
}
