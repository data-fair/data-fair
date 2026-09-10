/**
 * The "Par où commencer ?" section appended to the per-dataset API doc descriptions (public and
 * private variants). It orients readers towards the few operations that cover most integration
 * needs instead of the full operations list, and gives copy-paste URLs — most importantly the
 * vector tiles URL for GIS integration.
 *
 * The guide is built from the *finished* document: it only mentions an operation that actually
 * survived in `api.paths`. That single rule keeps it honest against both filtering passes without
 * duplicating either of them:
 *  - dataset-shape pruning (a meta-only dataset has no /lines, a virtual one no /full, ...)
 *  - the private doc's contextual filter, which keeps only what the caller may actually call.
 * Mentioning a route the reader would get a 404 or 403 on is worse than not mentioning it at all.
 *
 * Config-free on purpose (like shared/permissions/operations.ts): the doc generators pull in the
 * whole api config, so keeping this module free of it lets a unit test import it directly.
 */

export interface GettingStartedInputs {
  /**
   * A column the values aggregations accept, used in the example URL. Undefined when the dataset
   * has none — the aggregation routes are pruned in that case, so the bullet is dropped anyway.
   */
  aggField?: string
  /** The dataset is geographic: /lines also serves vector tiles and geo export formats. */
  hasBbox: boolean
}

/** Collect the operationIds still present in the document, i.e. what the reader can really call. */
const availableOperations = (api: any): Set<string> => {
  const available = new Set<string>()
  for (const methods of Object.values(api?.paths ?? {}) as any[]) {
    // path-level keys (parameters, summary, ...) have no operationId and are skipped by this test
    for (const op of Object.values(methods ?? {}) as any[]) {
      if (op?.operationId) available.add(op.operationId)
    }
  }
  return available
}

export const gettingStartedGuide = (api: any, { aggField, hasBbox }: GettingStartedInputs): string => {
  const serverUrl = api?.servers?.[0]?.url
  if (!serverUrl) return ''
  const linesUrl = `${serverUrl}/lines`
  const available = availableOperations(api)
  const has = (operationId: string) => available.has(operationId)

  const items: string[] = []

  const metadata: string[] = []
  if (has('readDescription')) metadata.push('`GET /` ("Lire les informations") retourne la fiche complète du jeu de données : titre, description, provenance, colonnes, etc.')
  if (has('readSchema')) metadata.push('`GET /schema` ("Lire le schéma") détaille les colonnes et leurs types.')
  if (metadata.length) items.push('**Obtenir les métadonnées** — ' + metadata.join(' '))

  if (has('readLines')) {
    items.push(`**Requêter les lignes** — \`GET /lines\` ("Lire les lignes") : recherche textuelle (\`q\`), filtres par colonne (par exemple \`ma_colonne_eq=une_valeur\`), tri, pagination via la propriété \`next\` de la réponse, export tableur avec \`format=csv\` ou \`format=xlsx\`. Exemple :

  \`${linesUrl}?size=10&q=exemple\``)
  }

  const aggs: string[] = []
  if (has('getValuesAgg')) {
    const field = aggField ?? '<colonne>'
    const fieldParam = aggField ? encodeURIComponent(aggField) : '<colonne>'
    aggs.push(`\`GET /values_agg\` ("Agréger les valeurs") compte les lignes par valeur d'une colonne. Exemple, comptage par valeur de la colonne \`${field}\` :

  \`${serverUrl}/values_agg?field=${fieldParam}&agg_size=10\`

  Pour calculer une métrique par groupe au lieu d'un simple comptage, renseignez \`metric\` **et** \`metric_field\` : \`metric\` seul est sans effet.`)
  }
  if (has('getMetricAgg')) {
    aggs.push('`GET /metric_agg` ("Calculer une métrique") calcule une métrique globale (somme, moyenne, percentiles, etc.) sur une colonne.')
  }
  if (aggs.length) items.push('**Agréger** — ' + aggs.join('\n\n  '))

  if (has('downloadFullData')) {
    items.push('**Télécharger** — `GET /full` ("Télécharger (données enrichies)") retourne toutes les lignes dans un fichier unique, colonnes calculées incluses.')
  }

  if (hasBbox && has('readLines')) {
    items.push(`**Carte / SIG** — ce jeu de données est géographique et expose des tuiles vectorielles : collez cette URL comme gabarit de tuiles dans votre outil (QGIS : nouvelle couche "Tuiles vectorielles" ; MapLibre / Mapbox GL JS : source de type "vector") :

  \`${linesUrl}?format=pbf&xyz={x},{y},{z}\`

  Le paramètre \`sampling\` (\`neighbors\` par défaut, ou \`max\`) ajuste la densité d'échantillonnage par tuile. Pour un export géographique ponctuel, préférez \`format=geojson\` (ou \`shp\`, \`wkt\`).`)
  }

  // A single bullet doesn't orient anyone — it's just the one route the reader already found.
  // Below two, the section costs more attention than it saves.
  if (items.length < 2) return ''

  return `
**Par où commencer ?** Cette documentation expose beaucoup d'opérations ; quelques points d'accès suffisent pour la plupart des besoins d'intégration.

${items.map(i => '- ' + i).join('\n')}
  `
}
