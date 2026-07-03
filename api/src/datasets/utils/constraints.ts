import { httpError } from '@data-fair/lib-utils/http-errors.js'

export const CONSTRAINT_INDEX_PREFIX = 'constraint_unique_'

/**
 * Validate dataset-wide constraints against the (extended) schema at config time.
 * Throws httpError(400, ...) on the first violation; returns void when all constraints are valid.
 *
 * `dataset` is passed by both call sites (creation in service.ts and patch in patch.ts) so that
 * this single guard can reject constraints declared on virtual or metaOnly datasets: those types
 * have no indexing worker pass and no Mongo data collection, so a declared constraint would never
 * actually be enforced. Callers already gate this call behind a non-empty constraints check, so
 * removing constraints (empty array) never reaches here and is always allowed.
 */
export const checkConstraints = (schema: any[], constraints: any[] | undefined, dataset?: { isVirtual?: boolean, isMetaOnly?: boolean }): void => {
  if (!constraints || !constraints.length) return
  if (dataset?.isVirtual || dataset?.isMetaOnly) {
    throw httpError(400, "Les contraintes d'unicité ne sont pas prises en charge sur les jeux de données virtuels ou sans données (isMetaOnly).")
  }
  const byKey = new Map((schema || []).map(p => [p.key, p]))
  for (const constraint of constraints) {
    if (constraint.type !== 'unique') continue
    const props: string[] = constraint.properties || []
    if (!props.length) {
      throw httpError(400, "Une contrainte d'unicité doit porter sur au moins une colonne.")
    }
    for (const key of props) {
      const prop = byKey.get(key)
      if (!prop) {
        throw httpError(400, `La colonne "${key}" d'une contrainte d'unicité n'existe pas dans le schéma.`)
      }
      if (prop['x-calculated'] || prop['x-extension']) {
        throw httpError(400, `La colonne "${key}" est calculée ou issue d'un enrichissement et ne peut pas porter une contrainte d'unicité.`)
      }
      if (prop['x-capabilities'] && prop['x-capabilities'].values === false) {
        throw httpError(400, `La colonne "${key}" doit avoir la capacité "Triable et groupable" activée pour porter une contrainte d'unicité.`)
      }
      if (prop['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
        throw httpError(400, `La colonne "${key}" est une géométrie et ne peut pas porter une contrainte d'unicité.`)
      }
      if (prop.type === 'object') {
        throw httpError(400, `La colonne "${key}" est un objet et ne peut pas porter une contrainte d'unicité.`)
      }
      if (prop.separator) {
        throw httpError(400, `La colonne "${key}" est multivaluée et ne peut pas porter une contrainte d'unicité.`)
      }
    }
  }
}
