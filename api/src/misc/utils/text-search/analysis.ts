// Text analysis for the text-search util. NO IMPORTS — this file is the innermost layer and must
// stay extractable to @data-fair/lib-utils, which is dependency-less by charter.

export interface AnalyzedToken {
  term: string
  /**
   * Index in the RAW token stream, before stopwords and short tokens are dropped. Phrase
   * adjacency is checked on these, so the gap left by a removed stopword is meaningful:
   * "courbe de charge" yields positions 0 and 2 and therefore does not match "courbe et charge".
   */
  position: number
}

export interface Analyzer {
  language: string
  analyze (text: string | null | undefined): AnalyzedToken[]
}

export type Stemmer = (word: string) => string

/** Short closed lists, inlined rather than pulled from a package. */
const STOPWORDS: Record<string, Set<string>> = {
  fr: new Set(('au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous est sont etre avoir').split(' ')),
  en: new Set(('a an and are as at be by for from has he in is it its of on that the to was were will with').split(' '))
}

const VOWELS = 'aeiouy'

/**
 * A light French stemmer: it removes inflection (plurals, feminines) and leaves derivation alone,
 * so "consommation" stays whole. Deliberately not Snowball — see the spec's §4 for why the two
 * measure the same on this scorer and light wins on hand-writability.
 * Input must already be lowercased and deaccented.
 */
export const lightFrenchStem = (word: string): string => {
  let w = word
  if (w.length <= 3) return w
  if (w.length > 5 && w.endsWith('eaux')) w = w.slice(0, -1)            // bateaux -> bateau
  else if (w.length > 5 && w.endsWith('aux')) w = w.slice(0, -3) + 'al' // chevaux -> cheval
  // Drop trailing x/s/e to a fixed point. Iterating matters: "donnees" -> "donnee" -> "donne" ->
  // "donn" must land where "donne" -> "donn" lands, or the two forms never unify.
  while (w.length > 4 && (w.endsWith('x') || w.endsWith('s') || w.endsWith('e'))) w = w.slice(0, -1)
  // collapse a doubled final consonant: "annuell" -> "annuel"
  const last = w[w.length - 1]
  if (w.length > 4 && last === w[w.length - 2] && !VOWELS.includes(last)) w = w.slice(0, -1)
  return w
}

const lightEnglishStem = (word: string): string => {
  let w = word
  if (w.length <= 3) return w
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w
}

const BUILT_IN_STEMMERS: Record<string, Stemmer> = { fr: lightFrenchStem, en: lightEnglishStem }

const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * @param language two-letter code; an unknown one degrades to no stemming and no stopwords
 * @param stemmers overrides the built-ins, so a deployment can supply broader language coverage
 */
export const createAnalyzer = (language: string, stemmers?: Record<string, Stemmer>): Analyzer => {
  const stem = (stemmers ?? BUILT_IN_STEMMERS)[language] ?? ((w: string) => w)
  const stop = STOPWORDS[language] ?? new Set<string>()
  return {
    language,
    analyze (text) {
      if (text === null || text === undefined) return []
      // The apostrophe is a separator, so French elision ("l'eau") needs no special rule: the
      // article becomes its own one-character token and is dropped below.
      const raw = deaccent(String(text)).toLowerCase().split(/[^a-z0-9]+/)
      const out: AnalyzedToken[] = []
      for (let position = 0; position < raw.length; position++) {
        const word = raw[position]
        if (word.length < 2 || stop.has(word)) continue
        const term = stem(word)
        if (term) out.push({ term, position })
      }
      return out
    }
  }
}
