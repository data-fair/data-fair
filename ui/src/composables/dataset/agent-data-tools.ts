import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'
import {
  executeGetDatasetSchema,
  executeSearchData,
  executeAggregateData,
  executeCalculateMetric,
  executeGetFieldValues
} from './agent-data-tools-logic'
import type { SearchDataParams, AggregateDataParams, CalculateMetricParams } from './agent-data-tools-logic'

export {
  applyGeoParams,
  applyDateMatchParam,
  normalizeSort,
  executeGetDatasetSchema,
  executeSearchData,
  executeAggregateData,
  executeCalculateMetric,
  executeGetFieldValues
} from './agent-data-tools-logic'

export type {
  SearchDataParams,
  AggregateDataParams,
  CalculateMetricParams
} from './agent-data-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    getDatasetSchema: 'Obtenir le schéma du jeu de données',
    searchData: 'Rechercher des lignes de données',
    aggregateData: 'Agréger des données',
    calculateMetric: 'Calculer une métrique',
    getFieldValues: 'Obtenir les valeurs distinctes',
    datasetDataSubAgent: 'Interroger les données d\'un jeu de données',
    datasetDataSubAgentDesc: 'Interroger les lignes d\'un jeu de données, calculer des agrégations et explorer les valeurs des colonnes. Fournissez l\'identifiant du jeu de données et décrivez les données dont vous avez besoin.'
  },
  en: {
    getDatasetSchema: 'Get dataset schema',
    searchData: 'Search data rows',
    aggregateData: 'Aggregate data',
    calculateMetric: 'Calculate a metric',
    getFieldValues: 'Get distinct values',
    datasetDataSubAgent: 'Query dataset data',
    datasetDataSubAgentDesc: 'Query dataset rows, compute aggregations, and explore field values. Provide the dataset ID and describe what data you need.'
  }
}

const filtersDescription = 'Column filters as key-value pairs. Key format: column_key + suffix (_eq, _neq, _search, _in, _nin, _starts, _contains, _gte, _gt, _lte, _lt, _exists, _nexists). All values must be strings. Example: {"nom_search":"Jean","age_lte":"30"}'

export function useAgentDatasetDataTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'get_dataset_schema',
    description: 'Get column schema and 3 sample rows for a dataset. Always call this first before querying data to understand the structure.',
    annotations: { title: t('getDatasetSchema'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' }
      },
      required: ['datasetId'] as const
    },
    execute: (params) => executeGetDatasetSchema(params, $fetch)
  })

  useAgentTool({
    name: 'search_data',
    description: 'Search for data rows in a dataset using full-text search or column filters. Returns matching rows as CSV. Do NOT use for statistics — use calculate_metric or aggregate_data instead.',
    annotations: { title: t('searchData'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        q: { type: 'string' as const, description: 'Full-text search keywords (optional)' },
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        select: { type: 'string' as const, description: 'Comma-separated column keys to return (optional, defaults to all)' },
        sort: { type: 'string' as const, description: 'Sort order: column keys, prefix with - for desc. Special: _score, _i, _updatedAt, _rand, _geo_distance:lon:lat (distance from point, for geolocalized datasets)' },
        size: { type: 'number' as const, description: 'Page size (default 10, max 50)' },
        page: { type: 'number' as const, description: 'Page number (default 1)' },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax". Example: "-2.5,43,3,47"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km". Use distance "0" for point-in-polygon containment.' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD". ISO datetimes also accepted.' },
        next: { type: 'string' as const, description: 'URL from a previous search_data response to fetch the next page. When provided, all other parameters are ignored.' }
      },
      required: ['datasetId'] as const
    },
    execute: (params) => executeSearchData(params as SearchDataParams, $fetch)
  })

  useAgentTool({
    name: 'aggregate_data',
    description: 'Aggregate dataset rows by 1-3 columns with optional metric (sum, avg, min, max, count). Defaults to counting rows per group. For a single global metric without grouping, use calculate_metric.',
    annotations: { title: t('aggregateData'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        groupByColumns: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Columns to group by (1-3 column keys)'
        },
        metric: {
          type: 'object' as const,
          properties: {
            column: { type: 'string' as const, description: 'Column to compute the metric on' },
            type: { type: 'string' as const, description: 'One of: sum, avg, min, max, count' }
          },
          description: 'Optional metric to compute on each group'
        },
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km"' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD"' },
        sort: { type: 'string' as const, description: 'Sort: count/-count, key/-key, metric/-metric' }
      },
      required: ['datasetId', 'groupByColumns'] as const
    },
    execute: (params) => executeAggregateData(params as AggregateDataParams, $fetch)
  })

  useAgentTool({
    name: 'calculate_metric',
    description: 'Calculate a single metric on a dataset column: avg, sum, min, max, stats, value_count, cardinality, percentiles. For per-group breakdowns, use aggregate_data.',
    annotations: { title: t('calculateMetric'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        fieldKey: { type: 'string' as const, description: 'Column key to compute the metric on' },
        metric: { type: 'string' as const, description: 'One of: avg, sum, min, max, stats, value_count, cardinality, percentiles' },
        percents: { type: 'string' as const, description: 'For percentiles: comma-separated percentages (default "1,5,25,50,75,95,99")' },
        filters: { type: 'object' as const, description: filtersDescription, properties: {} },
        bbox: { type: 'string' as const, description: 'Geographic bounding box filter (only for geolocalized datasets). Format: "lonMin,latMin,lonMax,latMax"' },
        geoDistance: { type: 'string' as const, description: 'Geographic proximity filter (only for geolocalized datasets). Format: "lon,lat,distance". Example: "2.35,48.85,10km"' },
        dateMatch: { type: 'string' as const, description: 'Temporal filter (only for temporal datasets). Single date "YYYY-MM-DD" or date range "YYYY-MM-DD,YYYY-MM-DD"' }
      },
      required: ['datasetId', 'fieldKey', 'metric'] as const
    },
    execute: (params) => executeCalculateMetric(params as CalculateMetricParams, $fetch)
  })

  useAgentTool({
    name: 'get_field_values',
    description: 'List distinct values of a column. Useful to discover values before filtering with _eq or _in.',
    annotations: { title: t('getFieldValues'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'The exact dataset ID' },
        fieldKey: { type: 'string' as const, description: 'Column key to get values for' },
        q: { type: 'string' as const, description: 'Optional text to filter values' },
        sort: { type: 'string' as const, description: 'asc or desc (default asc)' },
        size: { type: 'number' as const, description: 'Number of values to return (default 10, max 1000)' }
      },
      required: ['datasetId', 'fieldKey'] as const
    },
    execute: (params) => executeGetFieldValues(params, $fetch)
  })

  const datasetDataPrompts: Record<string, string> = {
    fr: `Tu es un assistant analyste de données pour une plateforme de données. Tu aides les utilisateurs à explorer et comprendre les jeux de données en interrogeant leur contenu.

Processus :
1. Appelle toujours get_dataset_schema en premier pour comprendre les noms de colonnes, types et exemples de données avant d'utiliser les autres outils.
2. Choisis le bon outil :
   - get_field_values : pour découvrir les valeurs distinctes d'une colonne avant de filtrer
   - search_data : pour récupérer des lignes correspondant à des filtres ou une recherche textuelle. NE PAS utiliser pour des statistiques.
   - aggregate_data : pour regrouper des lignes par colonnes et compter ou calculer des métriques par groupe (sum, avg, min, max)
   - calculate_metric : pour calculer une statistique globale unique (avg, sum, min, max, stats, percentiles, cardinality)

Format :
- Présente les résultats de manière concise avec des libellés clairs
- Pour les résultats numériques, arrondis à 2 décimales si approprié
- Pour les données tabulaires, résume les observations clés plutôt que d'afficher les lignes brutes
- Réponds dans la langue de la question de l'utilisateur
- Lorsque tu effectues une requête filtrée (search_data avec filters, q, sort, bbox, geoDistance ou dateMatch), inclus toujours à la fin de ta réponse une section "Navigation params" listant les paramètres de requête sous forme clé=valeur (un par ligne). Ces paramètres utilisent le même format et peuvent être utilisés par l'assistant principal pour naviguer vers la page tableau du jeu de données avec les mêmes filtres. Exemple :
  Navigation params:
  status_eq=active
  age_lte=30
  sort=-date`,
    en: `You are a data analyst assistant for a data platform. You help users explore and understand datasets by querying their content.

Workflow:
1. Always call get_dataset_schema first to understand column names, types, and sample data before using other tools.
2. Choose the right tool for the task:
   - get_field_values: to discover distinct values of a column before filtering
   - search_data: to retrieve specific rows matching filters or text search. Do NOT use for statistics.
   - aggregate_data: to group rows by columns and count or compute per-group metrics (sum, avg, min, max)
   - calculate_metric: to compute a single global statistic (avg, sum, min, max, stats, percentiles, cardinality)

Format:
- Present results concisely with clear labels
- For numeric results, round to 2 decimal places when appropriate
- When returning tabular data, summarize key findings rather than just dumping raw rows
- Respond in the same language as the user's question
- When you perform a filtered query (search_data with filters, q, sort, bbox, geoDistance, or dateMatch), always include at the end of your response a "Navigation params" section listing the query parameters as key=value pairs (one per line). These params use the same format and can be used by the main assistant to navigate the user to the dataset table page with the same filters applied. Example:
  Navigation params:
  status_eq=active
  age_lte=30
  sort=-date`
  }

  useAgentSubAgent({
    name: 'dataset_data',
    title: t('datasetDataSubAgent'),
    description: t('datasetDataSubAgentDesc'),
    prompt: datasetDataPrompts[locale.value] ?? datasetDataPrompts.en,
    tools: ['get_dataset_schema', 'search_data', 'aggregate_data', 'calculate_metric', 'get_field_values']
  })
}
