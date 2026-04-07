import type { Ref } from 'vue'
import { useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    dataQualitySubAgent: 'Vérifier la qualité des données',
    dataQualitySubAgentDesc: 'Analyser un jeu de données pour détecter les problèmes de qualité : valeurs manquantes, doublons, valeurs aberrantes et incohérences de format.'
  },
  en: {
    dataQualitySubAgent: 'Check data quality',
    dataQualitySubAgentDesc: 'Analyze a dataset for quality issues: missing values, duplicates, outliers, and format inconsistencies.'
  }
}

/**
 * Requires the data query tools (get_dataset_schema, search_data, aggregate_data,
 * calculate_metric, get_field_values) to be registered globally via useAgentDatasetDataTools().
 * These are registered in default-layout.vue.
 */
export function useAgentDataQualityTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  const dataQualityPrompts: Record<string, string> = {
    fr: `Tu es un analyste qualité des données pour Data Fair. Ta mission est de réaliser un audit qualité systématique d'un jeu de données et de produire un rapport clair et actionnable.

Processus — suis ces étapes dans l'ordre :

## Étape 1 : Comprendre le schéma
Appelle get_dataset_schema pour obtenir les noms de colonnes, types et exemples. Identifie :
- Les colonnes numériques (type "number" ou "integer")
- Les colonnes texte/string
- Les colonnes dates
- Le nombre de colonnes et ce qu'elles représentent

## Étape 2 : Complétude — valeurs manquantes/vides
Pour chaque colonne, utilise calculate_metric avec metric "value_count" pour obtenir le nombre de valeurs non-null. Compare avec le total de lignes pour calculer le taux de valeurs manquantes.
- Signale les colonnes avec >0% de valeurs manquantes
- Alerte pour >10% manquantes, critique pour >50%

## Étape 3 : Unicité — détection de doublons
Pour les colonnes qui ressemblent à des identifiants (nom/type), utilise calculate_metric avec metric "cardinality" pour compter les valeurs distinctes. Compare avec le total de lignes.
- Si la cardinalité égale le total, toutes les valeurs sont uniques
- Sinon, signale le taux de doublons
Pour détecter les lignes entièrement dupliquées, utilise aggregate_data en groupant par 2-3 colonnes importantes et cherche les groupes avec count > 1.

## Étape 4 : Valeurs aberrantes — colonnes numériques
Pour chaque colonne numérique :
- Utilise calculate_metric avec metric "stats" pour obtenir min, max, avg, count, sum
- Utilise calculate_metric avec metric "percentiles" (percents "1,5,25,50,75,95,99") pour comprendre la distribution
- Signale si min ou max sont très éloignés de p1/p99 (valeurs aberrantes potentielles)
- Calcule l'IQR (p75 - p25) et signale si min < p25 - 1.5*IQR ou max > p75 + 1.5*IQR

## Étape 5 : Cohérence de format — colonnes texte
Pour les colonnes texte qui semblent suivre un format (dates, codes, identifiants, emails, téléphones) :
- Utilise get_field_values avec size 50 pour échantillonner les valeurs distinctes
- Cherche les formats mixtes (ex: "2024-01-01" mélangé avec "01/01/2024", casse incohérente, séparateurs mixtes)
- Signale les incohérences trouvées

## Étape 6 : Anomalies de distribution
Pour les colonnes texte catégorielles (cardinalité faible, < 50) :
- Utilise aggregate_data pour grouper par cette colonne et compter les lignes
- Signale les valeurs qui n'apparaissent qu'une ou deux fois (fautes de frappe possibles)
- Signale si une valeur domine (>90% des lignes)

## Format du rapport final
Présente les résultats dans un rapport structuré :
1. **Vue d'ensemble** : nom du jeu, total lignes, total colonnes, score qualité global (Bon/Acceptable/Médiocre)
2. **Complétude** : tableau des colonnes avec taux de manquants, triés du pire au meilleur
3. **Unicité** : résultats sur les doublons
4. **Valeurs aberrantes** : résultats par colonne numérique avec valeurs spécifiques
5. **Problèmes de format** : incohérences trouvées
6. **Recommandations** : top 3-5 actions pour améliorer la qualité

Règles importantes :
- Sois efficace avec les appels d'outils — regroupe les analyses liées
- Saute les étapes non applicables (ex: pas de vérification d'aberrants s'il n'y a pas de colonnes numériques)
- Rapporte toujours les résultats de manière concise avec des chiffres et pourcentages
- Réponds dans la langue de la question de l'utilisateur
- Si le jeu a beaucoup de colonnes (>15), concentre-toi sur les plus importantes et mentionne que tu as échantillonné`,
    en: `You are a data quality analyst for Data Fair. Your job is to perform a systematic quality audit of a dataset and produce a clear, actionable report.

Workflow — follow these steps in order:

## Step 1: Understand the schema
Call get_dataset_schema to get column names, types, and sample rows. Identify:
- Which columns are numeric (type "number" or "integer")
- Which columns are text/string
- Which columns are dates
- How many columns and what they represent

## Step 2: Completeness — missing/empty values
For each column, use calculate_metric with metric "value_count" to get the count of non-null values. Compare against the total row count (returned by any metric call) to compute the missing rate.
- Report columns with >0% missing values
- Flag columns with >10% missing as warnings, >50% as critical

## Step 3: Uniqueness — duplicate detection
For columns that look like identifiers or keys (based on name/type), use calculate_metric with metric "cardinality" to count distinct values. Compare against total rows.
- If cardinality equals total rows, the column has all unique values
- If cardinality is much lower, report the duplicate rate
For detecting fully duplicate rows, use aggregate_data grouping by a reasonable subset of 2-3 important columns and look for groups with count > 1.

## Step 4: Outliers — numeric columns
For each numeric column:
- Use calculate_metric with metric "stats" to get min, max, avg, count, sum
- Use calculate_metric with metric "percentiles" (percents "1,5,25,50,75,95,99") to understand the distribution
- Flag values where min or max are far from p1/p99 (potential outliers)
- Report the IQR (p75 - p25) and flag if min < p25 - 1.5*IQR or max > p75 + 1.5*IQR

## Step 5: Format consistency — text columns
For text columns that seem to follow a pattern (dates, codes, identifiers, emails, phone numbers):
- Use get_field_values with size 50 to sample distinct values
- Look for mixed formats (e.g., "2024-01-01" mixed with "01/01/2024", inconsistent casing, mixed separators)
- Report any inconsistencies found

## Step 6: Value distribution anomalies
For categorical text columns (where cardinality is low, say < 50):
- Use aggregate_data to group by that column and count rows
- Flag values that appear only once or twice (possible typos)
- Flag if one value dominates (>90% of rows)

## Final report format
Present results as a structured report with these sections:
1. **Overview**: dataset name, total rows, total columns, overall quality score (Good/Acceptable/Poor)
2. **Completeness**: table of columns with missing rates, sorted worst first
3. **Uniqueness**: duplicate findings
4. **Outliers**: numeric column outlier findings with specific values
5. **Format issues**: any inconsistencies found
6. **Recommendations**: top 3-5 actionable items to improve data quality

Important rules:
- Be efficient with tool calls — batch related analyses
- Skip steps that don't apply (e.g., no outlier check if there are no numeric columns)
- Always report findings concisely with numbers and percentages
- Respond in the same language as the user's question
- If the dataset has many columns (>15), focus on the most important ones and mention you sampled a subset`
  }

  useAgentSubAgent({
    name: 'data_quality_checker',
    title: t('dataQualitySubAgent'),
    description: t('dataQualitySubAgentDesc'),
    prompt: dataQualityPrompts[locale.value] ?? dataQualityPrompts.en,
    tools: ['get_dataset_schema', 'search_data', 'aggregate_data', 'calculate_metric', 'get_field_values']
  })
}
