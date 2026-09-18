import type { Analyzer } from './analysis.ts'
import type { ResolvedDefinition } from './definition.ts'

export interface IndexFields {
  /** every distinct stem in the document — the multikey-indexed candidate gate */
  _terms: string[]
  /** field → stem → raw positions. Term frequency is the array's length. */
  _pos: Record<string, Record<string, number[]>>
  /** field → number of INDEXED tokens (post-stopword). BM25 normalises by this. */
  _len: Record<string, number>
}

const SAFE_KEY = /^[a-z0-9]+$/

/** Reads a dotted path, flattening arrays, and joins everything to one string. */
export const extractFieldValue = (doc: any, path: string): string => {
  let current: any = [doc]
  for (const segment of path.split('.')) {
    const next: any[] = []
    for (const node of current) {
      if (node === null || node === undefined) continue
      const value = node[segment]
      if (Array.isArray(value)) next.push(...value)
      else if (value !== null && value !== undefined) next.push(value)
    }
    current = next
  }
  return current.filter(v => typeof v !== 'object').map(v => String(v)).join(' ')
}

export const buildIndexFields = (doc: any, def: ResolvedDefinition, analyzer: Analyzer): IndexFields | null => {
  const _pos: IndexFields['_pos'] = {}
  const _len: IndexFields['_len'] = {}
  const terms = new Set<string>()
  for (const field of Object.keys(def.fields)) {
    const tokens = analyzer.analyze(extractFieldValue(doc, field))
    _len[field] = tokens.length
    if (!tokens.length) continue
    const positions: Record<string, number[]> = {}
    for (const { term, position } of tokens) {
      // stems become mongo object keys; a '.' or a leading '$' would corrupt the write silently
      if (!SAFE_KEY.test(term)) throw new Error(`text-search: unsafe index key "${term}" produced by the analyzer`)
      ;(positions[term] ??= []).push(position)
      terms.add(term)
    }
    _pos[field] = positions
  }
  if (!terms.size) return null
  return { _terms: [...terms], _pos, _len }
}
