import type { Analyzer } from './analysis.ts'
import type { ResolvedDefinition } from './definition.ts'

export interface PhraseTerm { term: string, delta: number }

export interface ParsedQuery {
  positive: string[]
  negated: string[]
  /** each phrase is its terms with their offsets relative to the phrase's first token */
  phrases: PhraseTerm[][]
}

export interface CorpusStats {
  n: number
  df: Record<string, number>
  avgLen: Record<string, number>
}

export interface QueryPlan {
  /** the terms that are scored */
  terms: string[]
  idf: Record<string, number>
  /** the terms the candidate filter matches on */
  gate: string[]
  negated: string[]
  phrases: PhraseTerm[][]
  stats: CorpusStats
}

const PHRASE_RE = /"([^"]+)"/g

export const parseQuery = (q: string, analyzer: Analyzer): ParsedQuery => {
  const positive: string[] = []
  const negated: string[] = []
  const phrases: PhraseTerm[][] = []
  const text = String(q ?? '')

  // Collect all quoted phrases with their indices
  const phraseMatches = Array.from(text.matchAll(PHRASE_RE))

  // Process each quoted phrase
  for (const match of phraseMatches) {
    const tokens = analyzer.analyze(match[1])
    const indexOfQuote = match.index!

    // Check if there's a `-` immediately before the quote
    // This handles `-"phrase"` as term-level negation (excludes documents containing these terms,
    // not necessarily the exact phrase). Note: MongoDB $text supported true phrase negation, but
    // this approximation is simpler and never inverts intent like the original bug did.
    const isNegatedPhrase = indexOfQuote > 0 && text[indexOfQuote - 1] === '-'

    // Only create a phrase entry if it's not negated
    if (tokens.length > 1 && !isNegatedPhrase) {
      const base = tokens[0].position
      phrases.push(tokens.map(t => ({ term: t.term, delta: t.position - base })))
    }

    for (const t of tokens) {
      (isNegatedPhrase ? negated : positive).push(t.term)
    }
  }

  // Remove phrases from text, replacing with spaces
  let rest = text
  for (const match of phraseMatches) {
    rest = rest.replace(match[0], ' ')
  }

  // `-word` negates, matching $text, Elasticsearch and common convention. Known trap, accepted:
  // a nanoid()-generated tag can start with '-', so q=<tag> parses as a negation.
  for (const word of rest.split(/\s+/)) {
    if (!word) continue
    const isNegated = word.startsWith('-')
    for (const t of analyzer.analyze(isNegated ? word.slice(1) : word)) {
      (isNegated ? negated : positive).push(t.term)
    }
  }
  return { positive: [...new Set(positive)], negated: [...new Set(negated)], phrases }
}

/** Every term the caller must fetch a df for before planning. */
export const queryTerms = (parsed: ParsedQuery): string[] =>
  [...new Set([...parsed.positive, ...parsed.negated])]

export const planQuery = (parsed: ParsedQuery, stats: CorpusStats, def: ResolvedDefinition): QueryPlan | null => {
  // Negation wins: remove any terms that are also negated (prevents vacuous plans like "charge -charge")
  const negatedSet = new Set(parsed.negated)
  let terms = parsed.positive.filter(t => !negatedSet.has(t))

  // A term absent from the corpus cannot match or contribute to a score. Dropping it here is also
  // what stops a typo from becoming the gate.
  terms = terms.filter(t => (stats.df[t] ?? 0) > 0)
  if (!terms.length) return null

  const idf: Record<string, number> = {}
  for (const t of terms) {
    const df = stats.df[t] ?? 0
    idf[t] = Math.log(1 + (stats.n - df + 0.5) / (df + 0.5))
  }

  const phrases = parsed.phrases.filter(p => p.every(pt => terms.includes(pt.term)))
  const phraseTerms = new Set(phrases.flatMap(p => p.map(pt => pt.term)))

  // The gate is the rarest `gateSize` terms — never fewer than 2, or one unknown word empties the
  // page. Phrase terms join it unconditionally: the phrase $expr cannot use an index, so ANDing
  // their terms is what keeps that post-filter cheap.
  const byRarity = terms.slice().sort((a, b) => (stats.df[a] ?? 0) - (stats.df[b] ?? 0))
  const gate = [...new Set([...byRarity.slice(0, def.gateSize), ...phraseTerms])]

  return { terms, idf, gate, negated: parsed.negated.filter(t => (stats.df[t] ?? 0) > 0), phrases, stats }
}
