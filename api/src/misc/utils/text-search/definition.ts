import type { Stemmer } from './analysis.ts'

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
  for (const [field, weight] of Object.entries(def.fields)) {
    if (!(weight > 0)) throw new Error(`text-search: weight for "${field}" must be > 0`)
  }
  const gateSize = def.gateSize ?? 3
  // Not a tuning knob: gating on a single term makes the query an AND on it, so one unknown word
  // (a typo) becomes the gate and the result page is empty. See the spec's §5.
  if (gateSize < 2) throw new Error('text-search: gateSize must be at least 2')
  return { ...def, gateSize, tieBreaker: def.tieBreaker ?? 0.3, tieBreakField: def.tieBreakField ?? 'id' }
}
