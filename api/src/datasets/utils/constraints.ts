import { httpError } from '@data-fair/lib-utils/http-errors.js'
import moment from 'moment-timezone'

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
/**
 * User-facing message for a unicity violation, shared by the file-dataset diagnostic
 * (worker unicity gate) and the REST write rejection (409). Columns are labeled by their
 * schema title when available, falling back to the key.
 */
export const unicityViolationMessage = (properties: string[], schema?: { key: string, title?: string }[]): string => {
  const labels = properties.map(key => schema?.find(p => p.key === key)?.title || key)
  if (labels.length === 1) {
    return `Doublon détecté : le champ (${labels[0]}) contient déjà cette valeur. Chaque valeur de la colonne ${labels[0]} doit être unique.`
  }
  const group = labels.length === 2 ? 'le couple' : 'la combinaison'
  return `Doublon détecté : ${group} (${labels.join(' + ')}) doit être unique.`
}

export const START_DATE_CONCEPT = 'https://schema.org/startDate'
export const END_DATE_CONCEPT = 'https://schema.org/endDate'

/**
 * Resolve the columns carrying the startDate / endDate concepts for the dateCoherence
 * constraint. Returns null when either concept is missing from the schema.
 */
export const dateCoherenceProps = (schema: any[]): { startProp: any, endProp: any } | null => {
  const startProp = (schema || []).find(p => p['x-refersTo'] === START_DATE_CONCEPT)
  const endProp = (schema || []).find(p => p['x-refersTo'] === END_DATE_CONCEPT)
  if (!startProp || !endProp) return null
  return { startProp, endProp }
}

export const dateCoherenceViolationMessage = (startProp: any, endProp: any, startValue: any, endValue: any): string => {
  const startLabel = startProp.title || startProp.key
  const endLabel = endProp.title || endProp.key
  return `Incohérence de dates : la date de fin (${endLabel} : ${endValue}) est antérieure à la date de début (${startLabel} : ${startValue}).`
}

/**
 * Row-local dateCoherence check. Returns null when the row is valid, else the user-facing
 * French message. Rule: violation iff end < start (equality passes). A missing or
 * unparseable value passes — open-ended periods are legitimate, and format errors are
 * already reported by schema validation.
 * Mixed date / date-time pairs use day-boundary expansion in the field's timezone
 * (same convention as the date_match filter, see docs/architecture/date-management.md).
 */
export const dateCoherenceViolation = (startValue: any, endValue: any, startProp: any, endProp: any, defaultTimeZone: string): string | null => {
  if (startValue === undefined || startValue === null || startValue === '') return null
  if (endValue === undefined || endValue === null || endValue === '') return null
  const start = String(startValue)
  const end = String(endValue)
  const startIsDate = startProp.format === 'date'
  const endIsDate = endProp.format === 'date'
  if (startIsDate && endIsDate) {
    // normalized calendar dates (YYYY-MM-DD): lexicographic comparison, no timezone involved
    if (!moment(start, 'YYYY-MM-DD', true).isValid() || !moment(end, 'YYYY-MM-DD', true).isValid()) return null
    return end < start ? dateCoherenceViolationMessage(startProp, endProp, start, end) : null
  }
  // at least one date-time: compare instants, expanding bare dates to day boundaries
  const startInstant = startIsDate
    ? moment.tz(start, 'YYYY-MM-DD', true, startProp.timeZone || defaultTimeZone).startOf('day')
    : moment.parseZone(start, moment.ISO_8601, true)
  const endInstant = endIsDate
    ? moment.tz(end, 'YYYY-MM-DD', true, endProp.timeZone || defaultTimeZone).endOf('day')
    : moment.parseZone(end, moment.ISO_8601, true)
  if (!startInstant.isValid() || !endInstant.isValid()) return null
  return endInstant.valueOf() < startInstant.valueOf() ? dateCoherenceViolationMessage(startProp, endProp, start, end) : null
}

export const checkConstraints = (schema: any[], constraints: any[] | undefined, dataset?: { isVirtual?: boolean, isMetaOnly?: boolean }): void => {
  if (!constraints || !constraints.length) return
  if (dataset?.isVirtual || dataset?.isMetaOnly) {
    throw httpError(400, 'Les contraintes ne sont pas prises en charge sur les jeux de données virtuels ou sans données (isMetaOnly).')
  }
  const byKey = new Map((schema || []).map(p => [p.key, p]))
  let nbDateCoherence = 0
  for (const constraint of constraints) {
    if (constraint.type === 'dateCoherence') {
      nbDateCoherence++
      if (nbDateCoherence > 1) {
        throw httpError(400, 'Une seule contrainte de cohérence des dates peut être déclarée.')
      }
      const props = dateCoherenceProps(schema || [])
      if (!props) {
        throw httpError(400, 'La contrainte de cohérence des dates nécessite une colonne portant le concept "Date de début" (https://schema.org/startDate) et une colonne portant le concept "Date de fin" (https://schema.org/endDate).')
      }
      for (const prop of [props.startProp, props.endProp]) {
        if (prop['x-calculated'] || prop['x-extension']) {
          throw httpError(400, `La colonne "${prop.key}" est calculée ou issue d'un enrichissement et ne peut pas porter la contrainte de cohérence des dates.`)
        }
        if (prop.format !== 'date' && prop.format !== 'date-time') {
          throw httpError(400, `La colonne "${prop.key}" doit être une date ou une date-heure pour porter la contrainte de cohérence des dates.`)
        }
      }
      continue
    }
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
