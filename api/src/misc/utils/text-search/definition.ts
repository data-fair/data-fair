import type { Stemmer } from './analysis.ts'

/**
 * Sanitise a field path for use as a MongoDB document key in aggregation expressions.
 * Dotted paths like 'topics.title' are stored as literal keys, but when accessed via
 * a path expression like `$_pos.topics.title`, MongoDB reads it as a nested path traversal
 * (topics → title) instead of a literal lookup. This silently breaks scoring for dotted fields.
 * Solution: store under a sanitised key with dots replaced by underscores, and use that
 * key in all aggregation expressions.
 */
export const fieldKey = (path: string): string => path.replace(/\./g, '_')

export interface TextSearchDefinition {
  /** dotted path → weight. Paths may traverse arrays, e.g. 'topics.title'. */
  fields: Record<string, number>
  /** default language, used when a document declares none */
  language: string
  /** bump when fields, weights, language or the analyzer change — drives re-indexing */
  version: number
  /** candidate gate size: the rarest K query terms. Minimum 2. Default 3. */
  gateSize?: number
  /** dis_max tie_breaker. Default 0.3. */
  tieBreaker?: number
  /** deterministic secondary sort key. Default 'id'. */
  tieBreakField?: string
  /** override the built-in stemmers */
  stemmers?: Record<string, Stemmer>
}

export interface ResolvedDefinition extends TextSearchDefinition {
  gateSize: number
  tieBreaker: number
  tieBreakField: string
}

export const validateDefinition = (def: TextSearchDefinition): ResolvedDefinition => {
  if (!def.fields || !Object.keys(def.fields).length) throw new Error('text-search: fields must not be empty')

  // Check for path collisions after sanitisation (e.g., 'topics.title' and 'topics_title' both become 'topics_title')
  const sanitisedPaths = new Map<string, string>()
  for (const field of Object.keys(def.fields)) {
    const sanitised = fieldKey(field)
    if (sanitisedPaths.has(sanitised) && sanitisedPaths.get(sanitised) !== field) {
      throw new Error(`text-search: field paths "${sanitisedPaths.get(sanitised)}" and "${field}" collide after sanitisation (both become "${sanitised}")`)
    }
    sanitisedPaths.set(sanitised, field)
  }

  for (const [field, weight] of Object.entries(def.fields)) {
    if (!(weight > 0)) throw new Error(`text-search: weight for "${field}" must be > 0`)
  }
  const gateSize = def.gateSize ?? 3
  // Not a tuning knob: gating on a single term makes the query an AND on it, so one unknown word
  // (a typo) becomes the gate and the result page is empty. See the spec's §5.
  if (!(gateSize >= 2)) throw new Error('text-search: gateSize must be at least 2')
  return { ...def, gateSize, tieBreaker: def.tieBreaker ?? 0.3, tieBreakField: def.tieBreakField ?? 'id' }
}
