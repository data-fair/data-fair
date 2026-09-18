# Reusable text-search util — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MongoDB `$text` index behind `q=` on datasets and applications with an owned
inverted index and a dis_max BM25 scorer generated into the aggregation pipeline.

**Architecture:** A `text-search/` module whose pure parts import nothing and whose single I/O part
takes a `Collection` as a parameter, so it is extractable to `~/data-fair/lib` unchanged. Documents
carry `_terms` / `_pos` / `_len`; queries are planned in node (sub-millisecond) and scored by mongo
in an `$addFields` stage, so the API process never walks the candidate set.

**Tech Stack:** TypeScript (ESM, `.ts` extensions in imports), MongoDB 6 driver, Playwright test
runner with `node:assert/strict`, `memoizee`.

**Spec:** [2026-09-18-text-search-util-design.md](./2026-09-18-text-search-util-design.md) — read it
alongside this plan; every "why" lives there and is not repeated here.

## Global Constraints

- Nothing under `api/src/misc/utils/text-search/` may import `#config`, `#mongo`, `#types`, Express
  or any other data-fair module. `collections.ts` is the sole exception and is wiring, not util.
- Zero new runtime dependencies. `memoizee` is already a dependency and is the only one used.
- `analysis.ts` must have no imports at all.
- `gateSize` minimum is **2**, enforced at construction. `gateSize: 1` returns an empty page on a
  single typo.
- Every scored term's stem is used as a MongoDB object key, so stems must match `/^[a-z0-9]+$/`.
- BM25 constants: `K1 = 1.2`, `B = 0.75`, `tieBreaker = 0.3`,
  `idf(t) = Math.log(1 + (N - df + 0.5) / (df + 0.5))`.
- Sort is always `{ _score: -1, <tieBreakField>: 1 }` — never `_score` alone.
- Run a single test file with `npx playwright test --project=unit <path>` (or `--project=api`).
  Never run the whole suite while iterating; it is very long.
- Do not run `git push`, `git merge` or `git rebase`. Commit only.
- The branch is `feat-better-catalog-search` in the worktree
  `~/data-fair/data-fair_feat-better-catalog-search`.

## File Structure

| file | responsibility |
|---|---|
| `api/src/misc/utils/text-search/analysis.ts` | text → `{ term, position }[]`; stemmers; stopwords. No imports. |
| `api/src/misc/utils/text-search/definition.ts` | `TextSearchDefinition` type + `validateDefinition` |
| `api/src/misc/utils/text-search/indexing.ts` | document → `{ _terms, _pos, _len }` |
| `api/src/misc/utils/text-search/query.ts` | query string → `ParsedQuery`; `+ stats` → `QueryPlan` |
| `api/src/misc/utils/text-search/pipeline.ts` | `QueryPlan` → mongo filter, score expression, sort |
| `api/src/misc/utils/text-search/stats.ts` | `StatsProvider` — memoized counts, takes a `Collection` |
| `api/src/misc/utils/text-search/index.ts` | `defineTextSearch()` façade |
| `api/src/misc/utils/text-search/collections.ts` | the configured datasets/applications instances |

---

### Task 1: Analysis — tokenisation, stemming, positions

**Files:**
- Create: `api/src/misc/utils/text-search/analysis.ts`
- Test: `tests/features/text-search/analysis.unit.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface AnalyzedToken { term: string, position: number }`;
  `interface Analyzer { language: string, analyze (text: string | null | undefined): AnalyzedToken[] }`;
  `createAnalyzer (language: string, stemmers?: Record<string, (w: string) => string>): Analyzer`;
  `lightFrenchStem (w: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/analysis.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer, lightFrenchStem } from '../../../api/src/misc/utils/text-search/analysis.ts'

const fr = createAnalyzer('fr')
const terms = (text: string) => fr.analyze(text).map(t => t.term)

test.describe('lightFrenchStem', () => {
  test('unifies singular and plural to the same stem', () => {
    // the point of stemming: both forms must collapse, or a query for one misses the other
    for (const [a, b] of [['charges', 'charge'], ['communes', 'commune'], ['donnees', 'donnee'], ['annuelles', 'annuelle']]) {
      assert.equal(lightFrenchStem(a), lightFrenchStem(b), `${a} vs ${b}`)
    }
  })

  test('irregular plurals in -aux', () => {
    assert.equal(lightFrenchStem('chevaux'), 'cheval')
    assert.equal(lightFrenchStem('bateaux'), 'bateau')
  })

  test('is LIGHT — it does not strip derivational suffixes', () => {
    assert.equal(lightFrenchStem('consommation'), 'consommation')
  })

  test('leaves short words alone', () => {
    assert.equal(lightFrenchStem('prix'), 'prix')
    assert.equal(lightFrenchStem('eau'), 'eau')
  })

  test('only ever produces [a-z0-9] — stems are used as mongo object keys', () => {
    for (const w of ['charges', 'chevaux', 'consommation', 'l', 'a1b2']) {
      assert.match(lightFrenchStem(w), /^[a-z0-9]*$/)
    }
  })
})

test.describe('analyzer', () => {
  test('deaccents, lowercases and drops stopwords', () => {
    assert.deepEqual(terms('Consommation de GAZ'), ['consommation', 'gaz'])
  })

  test('positions are RAW indices, so stopword gaps survive', () => {
    // "courbe de charge" must NOT look adjacent, or it would match "courbe et charge"
    const toks = fr.analyze('courbe de charge')
    assert.deepEqual(toks.map(t => t.position), [0, 2])
  })

  test('apostrophes separate, so elided articles disappear on their own', () => {
    assert.deepEqual(terms("l'eau d'ici"), ['eau', 'ici'])
  })

  test('drops one-character tokens', () => {
    assert.deepEqual(terms('a b cd'), ['cd'])
  })

  test('empty and nullish input give no tokens', () => {
    for (const v of ['', '   ', null, undefined]) assert.deepEqual(fr.analyze(v as any), [])
  })

  test('an unknown language degrades to no stemming, not a crash', () => {
    const xx = createAnalyzer('xx')
    assert.deepEqual(xx.analyze('Charges Communes').map(t => t.term), ['charges', 'communes'])
  })

  test('a custom stemmer can be injected', () => {
    const up = createAnalyzer('fr', { fr: (w) => w.slice(0, 3) })
    assert.deepEqual(up.analyze('consommation').map(t => t.term), ['con'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/analysis.unit.spec.ts`
Expected: FAIL — cannot find module `analysis.ts`.

- [ ] **Step 3: Write the implementation**

Create `api/src/misc/utils/text-search/analysis.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/analysis.unit.spec.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint api/src/misc/utils/text-search tests/features/text-search --fix
git add api/src/misc/utils/text-search/analysis.ts tests/features/text-search/analysis.unit.spec.ts
git commit -m "feat(text-search): analyzer with a hand-written light French stemmer and raw positions"
```

---

### Task 2: Definition and document indexing

**Files:**
- Create: `api/src/misc/utils/text-search/definition.ts`, `api/src/misc/utils/text-search/indexing.ts`
- Test: `tests/features/text-search/indexing.unit.spec.ts`

**Interfaces:**
- Consumes: `createAnalyzer`, `Analyzer` from `analysis.ts`.
- Produces:
  `interface TextSearchDefinition { fields: Record<string, number>, language: string, version: number, gateSize?: number, tieBreaker?: number, tieBreakField?: string, stemmers?: Record<string, Stemmer> }`;
  `interface ResolvedDefinition` — the same with `gateSize`, `tieBreaker`, `tieBreakField` required;
  `validateDefinition (def: TextSearchDefinition): ResolvedDefinition`;
  `interface IndexFields { _terms: string[], _pos: Record<string, Record<string, number[]>>, _len: Record<string, number> }`;
  `buildIndexFields (doc: any, def: ResolvedDefinition, analyzer: Analyzer): IndexFields | null`;
  `extractFieldValue (doc: any, path: string): string` (exported for tests).

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/indexing.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { buildIndexFields, extractFieldValue } from '../../../api/src/misc/utils/text-search/indexing.ts'

const def = validateDefinition({ fields: { title: 3, 'topics.title': 1, keywords: 1 }, language: 'fr', version: 1 })
const analyzer = createAnalyzer('fr')
const build = (doc: any) => buildIndexFields(doc, def, analyzer)

test.describe('validateDefinition', () => {
  test('applies the documented defaults', () => {
    const d = validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1 })
    assert.equal(d.gateSize, 3)
    assert.equal(d.tieBreaker, 0.3)
    assert.equal(d.tieBreakField, 'id')
  })

  test('refuses gateSize 1 — it returns an empty page on a single typo', () => {
    assert.throws(() => validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: 1 }), /gateSize/)
  })

  test('refuses a NaN gateSize', () => {
    // `NaN < 2` is false, so a naive comparison would silently accept it
    assert.throws(() => validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: NaN }), /gateSize/)
  })

  test('accepts gateSize 2 as the valid boundary', () => {
    // the accept side matters too: an off-by-one regression to `< 3` would otherwise pass
    assert.equal(validateDefinition({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: 2 }).gateSize, 2)
  })

  test('refuses an empty field map and non-positive weights', () => {
    assert.throws(() => validateDefinition({ fields: {}, language: 'fr', version: 1 }), /fields/)
    assert.throws(() => validateDefinition({ fields: { title: 0 }, language: 'fr', version: 1 }), /weight/)
  })
})

test.describe('extractFieldValue', () => {
  test('reads a plain path', () => {
    assert.equal(extractFieldValue({ title: 'Consommation' }, 'title'), 'Consommation')
  })

  test('traverses an array of objects', () => {
    assert.equal(extractFieldValue({ topics: [{ title: 'Energie' }, { title: 'Climat' }] }, 'topics.title'), 'Energie Climat')
  })

  test('joins a plain array', () => {
    assert.equal(extractFieldValue({ keywords: ['gaz', 'electricite'] }, 'keywords'), 'gaz electricite')
  })

  test('missing paths and non-strings give an empty string', () => {
    assert.equal(extractFieldValue({}, 'title'), '')
    assert.equal(extractFieldValue({ a: { b: null } }, 'a.b'), '')
    assert.equal(extractFieldValue({ n: 42 }, 'n'), '42')
  })
})

test.describe('buildIndexFields', () => {
  test('collects unique stems across fields into _terms', () => {
    const r = build({ title: 'Charges communes', keywords: ['charge'] })!
    assert.ok(r._terms.includes('charg'))
    assert.ok(r._terms.includes('commun'))
    assert.equal(new Set(r._terms).size, r._terms.length, '_terms must be unique')
  })

  test('_pos holds raw positions per field per stem, and _len the kept token count', () => {
    const r = build({ title: 'courbe de charge' })!
    assert.deepEqual(r._pos.title.courb, [0])
    assert.deepEqual(r._pos.title.charg, [2])
    assert.equal(r._len.title, 2)
  })

  test('a repeated term records every position', () => {
    const r = build({ title: 'charge charge' })!
    assert.deepEqual(r._pos.title.charg, [0, 1])
  })

  test('fields with no content are omitted from _pos but present in _len as 0', () => {
    const r = build({ title: 'charge' })!
    assert.equal(r._pos['topics.title'], undefined)
    assert.equal(r._len['topics.title'], 0)
  })

  test('returns null when the document has nothing indexable', () => {
    assert.equal(build({}), null)
    assert.equal(build({ title: '   ' }), null)
  })

  test('throws if a stem is not a safe mongo key', () => {
    // stems become object keys in _pos; a '.' or leading '$' would corrupt the write silently
    const bad = createAnalyzer('fr', { fr: () => 'a.b' })
    assert.throws(() => buildIndexFields({ title: 'charge' }, def, bad), /unsafe/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/indexing.unit.spec.ts`
Expected: FAIL — cannot find module `definition.ts`.

- [ ] **Step 3: Write `definition.ts`**

```ts
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

/**
 * Sanitise a field path for use as a MongoDB document key. A dotted path like 'topics.title'
 * stored as a literal key is UNADDRESSABLE from an aggregation path expression: `$_pos.topics.title`
 * reads as the nested traversal _pos -> topics -> title, resolves to nothing, and scores the
 * document ZERO while it still matches via _terms. Store under the sanitised key instead.
 */
export const fieldKey = (path: string): string => path.replace(/\./g, '_')

export const validateDefinition = (def: TextSearchDefinition): ResolvedDefinition => {
  if (!def.fields || !Object.keys(def.fields).length) throw new Error('text-search: fields must not be empty')
  for (const [field, weight] of Object.entries(def.fields)) {
    if (!(weight > 0)) throw new Error(`text-search: weight for "${field}" must be > 0`)
  }
  // two paths that sanitise to the same key would overwrite each other's _pos/_len entries
  const sanitised = new Map<string, string>()
  for (const field of Object.keys(def.fields)) {
    const key = fieldKey(field)
    const seen = sanitised.get(key)
    if (seen && seen !== field) throw new Error(`text-search: field paths "${seen}" and "${field}" collide after sanitisation (both become "${key}")`)
    sanitised.set(key, field)
  }
  const gateSize = def.gateSize ?? 3
  // Not a tuning knob: gating on a single term makes the query an AND on it, so one unknown word
  // (a typo) becomes the gate and the result page is empty. See the spec's §5.
  // NaN-safe: `NaN < 2` is false, so the naive `gateSize < 2` would let a NaN through the very
  // check that makes an empty-page-on-one-typo failure impossible. Matches the weight check above.
  if (!(gateSize >= 2)) throw new Error('text-search: gateSize must be at least 2')
  return { ...def, gateSize, tieBreaker: def.tieBreaker ?? 0.3, tieBreakField: def.tieBreakField ?? 'id' }
}
```

- [ ] **Step 4: Write `indexing.ts`**

```ts
import type { Analyzer } from './analysis.ts'
import { fieldKey, type ResolvedDefinition } from './definition.ts'

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
    // read the document by the ORIGINAL dotted path, but STORE under the sanitised key
    const tokens = analyzer.analyze(extractFieldValue(doc, field))
    const key = fieldKey(field)
    _len[key] = tokens.length
    if (!tokens.length) continue
    const positions: Record<string, number[]> = {}
    for (const { term, position } of tokens) {
      // stems become mongo object keys; a '.' or a leading '$' would corrupt the write silently
      if (!SAFE_KEY.test(term)) throw new Error(`text-search: unsafe index key "${term}" produced by the analyzer`)
      ;(positions[term] ??= []).push(position)
      terms.add(term)
    }
    _pos[key] = positions
  }
  if (!terms.size) return null
  return { _terms: [...terms], _pos, _len }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/indexing.unit.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint api/src/misc/utils/text-search tests/features/text-search --fix
git add api/src/misc/utils/text-search tests/features/text-search
git commit -m "feat(text-search): definition validation and document index fields"
```

---

### Task 3: Query parsing and planning

**Files:**
- Create: `api/src/misc/utils/text-search/query.ts`
- Test: `tests/features/text-search/query.unit.spec.ts`

**Interfaces:**
- Consumes: `Analyzer`, `ResolvedDefinition`.
- Produces:
  `interface ParsedQuery { positive: string[], negated: string[], phrases: { term: string, delta: number }[][] }`;
  `parseQuery (q: string, analyzer: Analyzer): ParsedQuery`;
  `interface CorpusStats { n: number, df: Record<string, number>, avgLen: Record<string, number> }`;
  `interface QueryPlan { terms: string[], idf: Record<string, number>, gate: string[], negated: string[], phrases: { term: string, delta: number }[][], stats: CorpusStats }`;
  `planQuery (parsed: ParsedQuery, stats: CorpusStats, def: ResolvedDefinition): QueryPlan | null`;
  `queryTerms (parsed: ParsedQuery): string[]` — every term whose `df` the caller must fetch.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/query.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { parseQuery, planQuery, queryTerms } from '../../../api/src/misc/utils/text-search/query.ts'

const analyzer = createAnalyzer('fr')
const def = validateDefinition({ fields: { title: 3 }, language: 'fr', version: 1 })
const stats = (df: Record<string, number>, n = 1000) => ({ n, df, avgLen: { title: 10 } })

test.describe('parseQuery', () => {
  test('plain words are positive terms', () => {
    assert.deepEqual(parseQuery('charges communes', analyzer).positive, ['charg', 'commun'])
  })

  test('a leading dash negates', () => {
    const p = parseQuery('charge -commune', analyzer)
    assert.deepEqual(p.positive, ['charg'])
    assert.deepEqual(p.negated, ['commun'])
  })

  test('a quoted group becomes a phrase carrying its raw offsets', () => {
    const p = parseQuery('"courbe de charge" annuelle', analyzer)
    assert.deepEqual(p.phrases, [[{ term: 'courb', delta: 0 }, { term: 'charg', delta: 2 }]])
    // phrase terms are also positive, so they take part in scoring
    assert.ok(p.positive.includes('courb') && p.positive.includes('charg') && p.positive.includes('annuel'))
  })

  test('a one-word quote is not a phrase', () => {
    assert.deepEqual(parseQuery('"charge"', analyzer).phrases, [])
  })

  test('an unterminated quote is treated as plain text', () => {
    assert.deepEqual(parseQuery('"courbe de charge', analyzer).phrases, [])
  })

  test('a dash before a quote negates the phrase instead of requiring it', () => {
    // the original bug inverted intent: the quote was stripped first and the '-' vanished,
    // so an exclusion silently became a requirement
    const p = parseQuery('-"courbe de charge"', analyzer)
    assert.deepEqual(p.negated.sort(), ['charg', 'courb'])
    assert.deepEqual(p.phrases, [])
    assert.equal(p.positive.includes('courb'), false)
  })

  test('a negated phrase composes with a positive term', () => {
    const p = parseQuery('gaz -"courbe de charge"', analyzer)
    assert.deepEqual(p.positive, ['gaz'])
    assert.deepEqual(p.negated.sort(), ['charg', 'courb'])
  })
})

test.describe('planQuery', () => {
  test('drops terms absent from the corpus', () => {
    const plan = planQuery(parseQuery('charge zzunknown', analyzer), stats({ charg: 10 }), def)!
    assert.deepEqual(plan.terms, ['charg'])
  })

  test('returns null when NO positive term survives — the caller must render no results', () => {
    assert.equal(planQuery(parseQuery('zzunknown', analyzer), stats({}), def), null)
    assert.equal(planQuery(parseQuery('', analyzer), stats({}), def), null)
  })

  test('returns null for a query that is only negations', () => {
    assert.equal(planQuery(parseQuery('-charge', analyzer), stats({ charg: 10 }), def), null)
  })

  test('the gate is the rarest gateSize terms', () => {
    const parsed = parseQuery('commune charge annuelle gaz', analyzer)
    const plan = planQuery(parsed, stats({ commun: 900, charg: 500, annuel: 100, gaz: 5 }), def)!
    assert.deepEqual(plan.gate.sort(), ['annuel', 'charg', 'gaz'].sort())
  })

  test('phrase terms are ALL in the gate, however common', () => {
    // four terms against a rarest-3 gate, with the phrase's two terms the COMMONEST: without the
    // phrase rule they fall outside the gate, so this test can actually fail
    const parsed = parseQuery('"courbe de charge" gaz eolien', analyzer)
    const plan = planQuery(parsed, stats({ courb: 900, charg: 950, gaz: 1, eolien: 2 }), def)!
    assert.equal(def.gateSize, 3)
    assert.ok(plan.gate.includes('courb'), 'a common phrase term must still be gated on')
    assert.ok(plan.gate.includes('charg'), 'a common phrase term must still be gated on')
    assert.ok(plan.gate.length > def.gateSize, 'the phrase widens the gate beyond rarest-K')
  })

  test('idf falls as df rises', () => {
    const plan = planQuery(parseQuery('charge gaz', analyzer), stats({ charg: 900, gaz: 2 }), def)!
    assert.ok(plan.idf.gaz > plan.idf.charg)
  })

  test('negated terms are carried but never scored', () => {
    const plan = planQuery(parseQuery('charge -gaz', analyzer), stats({ charg: 10, gaz: 5 }), def)!
    assert.deepEqual(plan.negated, ['gaz'])
    assert.equal(plan.idf.gaz, undefined)
  })

  test('negation wins over the same term used positively', () => {
    // otherwise the term sits in the gate AND the exclusion: unsatisfiable, with no signal
    assert.equal(planQuery(parseQuery('charge -charge', analyzer), stats({ charg: 10 }), def), null)
    const plan = planQuery(parseQuery('charge gaz -charge', analyzer), stats({ charg: 10, gaz: 5 }), def)!
    assert.deepEqual(plan.terms, ['gaz'])
    assert.equal(plan.gate.includes('charg'), false)
    assert.deepEqual(plan.negated, ['charg'])
  })
})

test('queryTerms lists every term needing a df lookup', () => {
  const p = parseQuery('charge -gaz "courbe de charge"', analyzer)
  assert.deepEqual(queryTerms(p).sort(), ['charg', 'courb', 'gaz'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/query.unit.spec.ts`
Expected: FAIL — cannot find module `query.ts`.

- [ ] **Step 3: Write the implementation**

```ts
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

  // quoted groups first, so their words are not re-read as loose terms below
  let rest = text
  for (const match of text.matchAll(PHRASE_RE)) {
    const tokens = analyzer.analyze(match[1])
    // A '-' immediately before the quote negates the phrase. Without this the quote is stripped
    // first and the orphaned '-' vanishes, so `-"courbe de charge"` would make the phrase
    // REQUIRED — the exact opposite of the request, silently. Term-level approximation: this
    // excludes documents containing those TERMS, not documents containing the exact phrase.
    // `$text` did true phrase exclusion; never inverting intent matters more than matching it.
    const negatedPhrase = match.index !== undefined && match.index > 0 && text[match.index - 1] === '-'
    if (negatedPhrase) {
      for (const t of tokens) negated.push(t.term)
    } else {
      if (tokens.length > 1) {
        const base = tokens[0].position
        phrases.push(tokens.map(t => ({ term: t.term, delta: t.position - base })))
      }
      for (const t of tokens) positive.push(t.term)
    }
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
  // A term absent from the corpus cannot match or contribute to a score. Dropping it here is also
  // what stops a typo from becoming the gate.
  // Negation wins: a term that is both positive and negated would otherwise sit in the gate AND
  // in the exclusion, making the query unsatisfiable with no signal that it is vacuous.
  const negatedSet = new Set(parsed.negated)
  const terms = parsed.positive.filter(t => !negatedSet.has(t) && (stats.df[t] ?? 0) > 0)
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
  // its terms is what keeps that post-filter cheap.
  const byRarity = terms.slice().sort((a, b) => (stats.df[a] ?? 0) - (stats.df[b] ?? 0))
  const gate = [...new Set([...byRarity.slice(0, def.gateSize), ...phraseTerms])]

  return { terms, idf, gate, negated: parsed.negated.filter(t => (stats.df[t] ?? 0) > 0), phrases, stats }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/query.unit.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint api/src/misc/utils/text-search tests/features/text-search --fix
git add api/src/misc/utils/text-search/query.ts tests/features/text-search/query.unit.spec.ts
git commit -m "feat(text-search): query parsing and planning with a rarest-K gate"
```

---

### Task 4: Pipeline generation — filter, dis_max score, sort

**Files:**
- Create: `api/src/misc/utils/text-search/pipeline.ts`
- Test: `tests/features/text-search/pipeline.unit.spec.ts`

**Interfaces:**
- Consumes: `QueryPlan`, `ResolvedDefinition`.
- Produces: `matchFilter (plan: QueryPlan, def: ResolvedDefinition): any`;
  `scoreExpression (plan: QueryPlan, def: ResolvedDefinition): any`;
  `sortSpec (def: ResolvedDefinition): Record<string, number>`;
  `INDEX_FIELD_NAMES: readonly string[]` — every stored field that must never reach a response.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/pipeline.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer } from '../../../api/src/misc/utils/text-search/analysis.ts'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { parseQuery, planQuery } from '../../../api/src/misc/utils/text-search/query.ts'
import { matchFilter, scoreExpression, sortSpec, INDEX_FIELD_NAMES } from '../../../api/src/misc/utils/text-search/pipeline.ts'

const analyzer = createAnalyzer('fr')
const def = validateDefinition({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })
const plan = (q: string, df: Record<string, number>) =>
  planQuery(parseQuery(q, analyzer), { n: 1000, df, avgLen: { title: 10, description: 50 } }, def)!

test('the filter gates on _terms', () => {
  const f = matchFilter(plan('charge gaz', { charg: 100, gaz: 5 }), def)
  assert.deepEqual(f._terms, { $in: ['gaz', 'charg'] })
})

test('negated terms add a $nin clause', () => {
  const f = matchFilter(plan('charge -gaz', { charg: 100, gaz: 5 }), def)
  assert.deepEqual(f._terms.$nin, ['gaz'])
})

test('a phrase adds an $expr clause, keeping the filter usable by find() and countDocuments()', () => {
  const f = matchFilter(plan('"courbe de charge"', { courb: 50, charg: 100 }), def)
  assert.ok(f.$expr, 'the phrase predicate must ride in the same filter object')
  assert.deepEqual(f._terms.$in.sort(), ['charg', 'courb'])
})

test('no phrase means no $expr', () => {
  assert.equal(matchFilter(plan('charge', { charg: 100 }), def).$expr, undefined)
})

test('the score is a dis_max over per-field scores, not a sum', () => {
  const expr = scoreExpression(plan('charge', { charg: 100 }), def)
  const json = JSON.stringify(expr)
  assert.ok(json.includes('$max'), 'dis_max requires $max over the field scores')
  assert.ok(json.includes('0.3'), 'the tie_breaker must appear')
})

test('term frequency is read as the size of the position array', () => {
  const json = JSON.stringify(scoreExpression(plan('charge', { charg: 100 }), def))
  assert.ok(json.includes('$size'), 'tf comes from $size of _pos, since _tf does not exist')
  assert.ok(json.includes('$_pos.title.charg'))
})

test('the sort always carries a deterministic tie-break', () => {
  assert.deepEqual(sortSpec(def), { _score: -1, id: 1 })
})

test('INDEX_FIELD_NAMES lists exactly the fields that must never reach a response', () => {
  // this list is the single source of truth for the projection excludes and clean() in Task 7
  assert.deepEqual([...INDEX_FIELD_NAMES], ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/pipeline.unit.spec.ts`
Expected: FAIL — cannot find module `pipeline.ts`.

- [ ] **Step 3: Write the implementation**

```ts
import { fieldKey, type ResolvedDefinition } from './definition.ts'
import type { QueryPlan, PhraseTerm } from './query.ts'

/**
 * Every field this util stores on a document. All of them must be excluded from API responses:
 * `findUtils.project` builds an EXCLUSION projection when `select` is absent, so anything not
 * named here is returned — which would ship kilobytes of position arrays and leak corpus stats.
 */
export const INDEX_FIELD_NAMES = ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex'] as const

const K1 = 1.2
const B = 0.75

/**
 * A phrase matches when its terms sit at the query's own relative offsets WITHIN ONE FIELD.
 * Per field, shift each term's position array by its offset and intersect; a non-empty
 * intersection for any field means the phrase is present.
 */
const phraseExpression = (phrase: PhraseTerm[], fields: string[]): any => ({
  $gt: [{
    $size: {
      $reduce: {
        input: fields.map(field => ({
          $reduce: {
            input: phrase.map(({ term, delta }) => ({
              $map: {
                input: { $ifNull: [`$_pos.${fieldKey(field)}.${term}`, []] },
                in: { $subtract: ['$$this', delta] }
              }
            })),
            initialValue: null,
            in: { $cond: [{ $eq: ['$$value', null] }, '$$this', { $setIntersection: ['$$value', '$$this'] }] }
          }
        })),
        initialValue: [],
        in: { $concatArrays: ['$$value', { $ifNull: ['$$this', []] }] }
      }
    }
  }, 0]
})

export const matchFilter = (plan: QueryPlan, def: ResolvedDefinition): any => {
  const terms: any = { $in: plan.gate }
  if (plan.negated.length) terms.$nin = plan.negated
  const filter: any = { _terms: terms }
  if (plan.phrases.length) {
    const fields = Object.keys(def.fields)
    const exprs = plan.phrases.map(p => phraseExpression(p, fields))
    // $expr is a normal query operator, so this filter still works with find() and
    // countDocuments() — no separate aggregation is needed to count phrase queries.
    filter.$expr = exprs.length === 1 ? exprs[0] : { $and: exprs }
  }
  return filter
}

export const scoreExpression = (plan: QueryPlan, def: ResolvedDefinition): any => {
  const fieldScores = Object.entries(def.fields).map(([field, weight]) => ({
    $multiply: [weight, {
      $add: plan.terms.map(term => ({
        $let: {
          vars: {
            // term frequency is the number of recorded positions
            tf: { $size: { $ifNull: [`$_pos.${fieldKey(field)}.${term}`, []] } },
            l: { $ifNull: [`$_len.${fieldKey(field)}`, 0] }
          },
          in: {
            $cond: [{ $eq: ['$$tf', 0] }, 0, {
              $multiply: [plan.idf[term], {
                $divide: [
                  { $multiply: ['$$tf', K1 + 1] },
                  { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / (plan.stats.avgLen[field] || 1), '$$l'] }] }] }] }
                ]
              }]
            }]
          }
        }
      }))
    }]
  }))
  // dis_max: the best field wins, the rest contribute tieBreaker x their sum. Summing instead
  // costs 7 hit@1 — it rewards a document for matching one term in many fields, so long
  // descriptions drown out a precise title.
  return {
    $let: {
      vars: { fs: fieldScores },
      in: { $add: [{ $max: '$$fs' }, { $multiply: [def.tieBreaker, { $subtract: [{ $sum: '$$fs' }, { $max: '$$fs' }] }] }] }
    }
  }
}

/** Never sort on _score alone: exact ties are common and mongo leaves them in an undefined order. */
export const sortSpec = (def: ResolvedDefinition): Record<string, number> =>
  ({ _score: -1, [def.tieBreakField]: 1 })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/pipeline.unit.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint api/src/misc/utils/text-search tests/features/text-search --fix
git add api/src/misc/utils/text-search/pipeline.ts tests/features/text-search/pipeline.unit.spec.ts
git commit -m "feat(text-search): dis_max BM25 score expression, filter and deterministic sort"
```

---

### Task 5: Stats provider

**Files:**
- Create: `api/src/misc/utils/text-search/stats.ts`
- Test: `tests/features/text-search/stats.unit.spec.ts`

**Interfaces:**
- Consumes: `CorpusStats` from `query.ts`, `ResolvedDefinition`.
- Produces:
  `interface StatsCollection { estimatedDocumentCount (): Promise<number>, countDocuments (filter: any): Promise<number>, aggregate (pipeline: any[]): { toArray (): Promise<any[]> } }`;
  `interface StatsProvider { get (terms: string[], ownerScope?: any): Promise<CorpusStats> }`;
  `createStatsProvider (collection: StatsCollection, def: ResolvedDefinition, options?: { dfMaxAge?: number, avgLenMaxAge?: number }): StatsProvider`.

The `StatsCollection` structural type is deliberate: it is the subset of the mongo `Collection`
API this module uses, so the module never imports the driver and the unit test can pass a fake.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/stats.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'
import { createStatsProvider } from '../../../api/src/misc/utils/text-search/stats.ts'

const def = validateDefinition({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })

const fakeCollection = () => {
  const calls: any[] = []
  return {
    calls,
    estimatedDocumentCount: async () => { calls.push(['estimated']); return 1000 },
    countDocuments: async (filter: any) => { calls.push(['count', filter]); return filter._terms === 'charg' ? 400 : 7 },
    aggregate: (pipeline: any[]) => ({ toArray: async () => { calls.push(['aggregate', pipeline]); return [{ title: 8, description: 40 }] } })
  }
}

test('returns n, df per term and avgLen per field', async () => {
  const stats = await createStatsProvider(fakeCollection(), def).get(['charg', 'gaz'])
  assert.equal(stats.n, 1000)
  assert.deepEqual(stats.df, { charg: 400, gaz: 7 })
  assert.deepEqual(stats.avgLen, { title: 8, description: 40 })
})

test('memoizes — a repeated term is not counted twice', async () => {
  const c = fakeCollection()
  const provider = createStatsProvider(c, def)
  await provider.get(['charg'])
  await provider.get(['charg'])
  assert.equal(c.calls.filter(x => x[0] === 'count').length, 1)
})

test('an owner scope is part of the count filter AND of the cache key', async () => {
  const c = fakeCollection()
  const provider = createStatsProvider(c, def)
  await provider.get(['charg'], { 'owner.type': 'organization', 'owner.id': 'a' })
  await provider.get(['charg'], { 'owner.type': 'organization', 'owner.id': 'b' })
  const counts = c.calls.filter(x => x[0] === 'count')
  assert.equal(counts.length, 2, 'different owners must not share a cached df')
  assert.equal(counts[0][1]['owner.id'], 'a')
})

test('n is counted rather than estimated when owner-scoped', async () => {
  const c = fakeCollection()
  await createStatsProvider(c, def).get(['charg'], { 'owner.id': 'a' })
  assert.equal(c.calls.filter(x => x[0] === 'estimated').length, 0)
})

test('no terms means no counting at all', async () => {
  const c = fakeCollection()
  const stats = await createStatsProvider(c, def).get([])
  assert.deepEqual(stats.df, {})
  assert.equal(c.calls.filter(x => x[0] === 'count').length, 0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/stats.unit.spec.ts`
Expected: FAIL — cannot find module `stats.ts`.

- [ ] **Step 3: Write the implementation**

```ts
import memoize from 'memoizee'
import type { ResolvedDefinition } from './definition.ts'
import type { CorpusStats } from './query.ts'

/** The subset of a mongo Collection this module uses — so it never imports the driver. */
export interface StatsCollection {
  estimatedDocumentCount (): Promise<number>
  countDocuments (filter: any): Promise<number>
  aggregate (pipeline: any[]): { toArray (): Promise<any[]> }
}

export interface StatsProvider {
  get (terms: string[], ownerScope?: Record<string, any>): Promise<CorpusStats>
}

/**
 * Counts corpus statistics at query time and memoizes them. There is deliberately no stored
 * table and no background rebuild: a rare term costs under a millisecond to count, and a 10% df
 * error moves idf by less than 10% — far inside the noise that separates a good ranking from a
 * bad one. See the spec's §7.
 */
export const createStatsProvider = (
  collection: StatsCollection,
  def: ResolvedDefinition,
  options: { dfMaxAge?: number, avgLenMaxAge?: number } = {}
): StatsProvider => {
  const scopeKey = (scope?: Record<string, any>) => scope ? JSON.stringify(scope) : ''

  const countTerm = memoize(
    async (term: string, key: string) => collection.countDocuments({ ...(key ? JSON.parse(key) : {}), _terms: term }),
    { promise: true, maxAge: options.dfMaxAge ?? 5 * 60 * 1000, max: 5000, primitive: true }
  )

  const countAll = memoize(
    async (key: string) => key ? collection.countDocuments(JSON.parse(key)) : collection.estimatedDocumentCount(),
    { promise: true, maxAge: options.dfMaxAge ?? 5 * 60 * 1000, max: 500, primitive: true }
  )

  // a full pass, so it gets a much longer TTL than df; it also changes far more slowly
  const averageLengths = memoize(
    async (key: string) => {
      const group: any = { _id: null }
      for (const field of Object.keys(def.fields)) group[field] = { $avg: `$_len.${field}` }
      const pipeline: any[] = []
      if (key) pipeline.push({ $match: JSON.parse(key) })
      pipeline.push({ $group: group })
      const [row] = await collection.aggregate(pipeline).toArray()
      const avgLen: Record<string, number> = {}
      for (const field of Object.keys(def.fields)) avgLen[field] = row?.[field] || 1
      return avgLen
    },
    { promise: true, maxAge: options.avgLenMaxAge ?? 60 * 60 * 1000, max: 500, primitive: true }
  )

  return {
    async get (terms, ownerScope) {
      const key = scopeKey(ownerScope)
      const [n, avgLen, counts] = await Promise.all([
        countAll(key),
        averageLengths(key),
        Promise.all(terms.map(async term => [term, await countTerm(term, key)] as const))
      ])
      return { n, avgLen, df: Object.fromEntries(counts) }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/stats.unit.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint api/src/misc/utils/text-search tests/features/text-search --fix
git add api/src/misc/utils/text-search/stats.ts tests/features/text-search/stats.unit.spec.ts
git commit -m "feat(text-search): memoized, owner-scopable corpus statistics"
```

---

### Task 6: Façade, configured collections, and mongo indexes

**Files:**
- Create: `api/src/misc/utils/text-search/index.ts`, `api/src/misc/utils/text-search/collections.ts`
- Modify: `api/src/mongo.ts` (the `datasets` and `applications` index blocks)
- Test: `tests/features/text-search/facade.unit.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: `defineTextSearch (def: TextSearchDefinition): TextSearch` where

```ts
interface TextSearch {
  definition: ResolvedDefinition
  buildIndexFields (doc: any): IndexFields | null
  /** null when no positive term survives — the caller MUST return no results */
  plan (q: string, statsProvider: StatsProvider, ownerScope?: Record<string, any>): Promise<QueryPlan | null>
  matchFilter (plan: QueryPlan): any
  scoreExpression (plan: QueryPlan): any
  sortSpec (): Record<string, number>
  indexFieldNames: readonly string[]
}
```
  and, from `collections.ts`: `datasetsTextSearch`, `applicationsTextSearch`,
  `datasetsStats`, `applicationsStats`.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/facade.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineTextSearch } from '../../../api/src/misc/utils/text-search/index.ts'

const ts = defineTextSearch({ fields: { title: 3, description: 1 }, language: 'fr', version: 1 })
const statsProvider = { get: async (terms: string[]) => ({ n: 100, df: Object.fromEntries(terms.map(t => [t, 5])), avgLen: { title: 5, description: 20 } }) }

test('indexes a document end to end', () => {
  const fields = ts.buildIndexFields({ title: 'Courbe de charge' })!
  assert.ok(fields._terms.includes('courb'))
  assert.deepEqual(fields._pos.title.charg, [2])
})

test('plans a query end to end and builds a usable filter', async () => {
  const plan = (await ts.plan('courbe charge', statsProvider))!
  assert.ok(plan)
  const filter = ts.matchFilter(plan)
  assert.ok(Array.isArray(filter._terms.$in))
  assert.ok(JSON.stringify(ts.scoreExpression(plan)).includes('$max'))
})

test('plan is null when nothing is searchable', async () => {
  const empty = { get: async () => ({ n: 100, df: {}, avgLen: { title: 5, description: 20 } }) }
  assert.equal(await ts.plan('zzunknown', empty), null)
})

test('the owner scope is forwarded to the stats provider', async () => {
  let seen: any
  const spy = { get: async (terms: string[], scope: any) => { seen = scope; return { n: 10, df: Object.fromEntries(terms.map(t => [t, 2])), avgLen: { title: 5, description: 20 } } } }
  await ts.plan('charge', spy, { 'owner.id': 'x' })
  assert.deepEqual(seen, { 'owner.id': 'x' })
})

test('an invalid definition is refused at construction', () => {
  assert.throws(() => defineTextSearch({ fields: { title: 1 }, language: 'fr', version: 1, gateSize: 1 }), /gateSize/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit tests/features/text-search/facade.unit.spec.ts`
Expected: FAIL — cannot find module `index.ts`.

- [ ] **Step 3: Write `index.ts`**

```ts
import { createAnalyzer } from './analysis.ts'
import { validateDefinition, type TextSearchDefinition, type ResolvedDefinition } from './definition.ts'
import { buildIndexFields, type IndexFields } from './indexing.ts'
import { parseQuery, planQuery, queryTerms, type QueryPlan } from './query.ts'
import { matchFilter, scoreExpression, sortSpec, INDEX_FIELD_NAMES } from './pipeline.ts'
import type { StatsProvider } from './stats.ts'

export type { TextSearchDefinition, ResolvedDefinition } from './definition.ts'
export type { IndexFields } from './indexing.ts'
export type { QueryPlan, CorpusStats } from './query.ts'
export { createStatsProvider, type StatsProvider, type StatsCollection } from './stats.ts'
export { INDEX_FIELD_NAMES } from './pipeline.ts'

export interface TextSearch {
  definition: ResolvedDefinition
  buildIndexFields (doc: any): IndexFields | null
  plan (q: string, statsProvider: StatsProvider, ownerScope?: Record<string, any>): Promise<QueryPlan | null>
  matchFilter (plan: QueryPlan): any
  scoreExpression (plan: QueryPlan): any
  sortSpec (): Record<string, number>
  indexFieldNames: readonly string[]
}

export const defineTextSearch = (def: TextSearchDefinition): TextSearch => {
  const definition = validateDefinition(def)
  const analyzer = createAnalyzer(definition.language, definition.stemmers)
  return {
    definition,
    buildIndexFields: (doc) => buildIndexFields(doc, definition, analyzer),
    async plan (q, statsProvider, ownerScope) {
      const parsed = parseQuery(q, analyzer)
      const terms = queryTerms(parsed)
      if (!terms.length) return null
      const stats = await statsProvider.get(terms, ownerScope)
      return planQuery(parsed, stats, definition)
    },
    matchFilter: (plan) => matchFilter(plan, definition),
    scoreExpression: (plan) => scoreExpression(plan, definition),
    sortSpec: () => sortSpec(definition),
    indexFieldNames: INDEX_FIELD_NAMES
  }
}
```

- [ ] **Step 4: Write `collections.ts`**

```ts
// data-fair wiring for the text-search util. This is the ONLY file under text-search/ allowed to
// import data-fair modules; everything else must stay extractable to @data-fair/lib.
import config from '#config'
import mongo from '#mongo'
import { defineTextSearch, createStatsProvider } from './index.ts'

/** Mirrors the weights of the `fulltext` index it replaces (see api/src/mongo.ts). */
export const datasetsTextSearch = defineTextSearch({
  fields: {
    title: 3,
    searchTerms: 3,
    summary: 2,
    description: 1,
    keywords: 1,
    'topics.title': 1,
    'owner.name': 1,
    'owner.departmentName': 1,
    _searchText: 1
  },
  language: config.catalogSearch.language,
  version: 1
})

export const applicationsTextSearch = defineTextSearch({
  fields: {
    title: 3,
    summary: 2,
    description: 1,
    'owner.name': 1,
    'owner.departmentName': 1
  },
  language: config.catalogSearch.language,
  version: 1
})

export const datasetsStats = createStatsProvider(mongo.datasets as any, datasetsTextSearch.definition)
export const applicationsStats = createStatsProvider(mongo.applications as any, applicationsTextSearch.definition)
```

- [ ] **Step 5: Add the indexes in `api/src/mongo.ts`**

In the `datasets` block, keep the existing `fulltext` declaration untouched (it is removed a
release later, so a rolling deploy's old pods keep working) and add:

```ts
        terms: { _terms: 1 },
        'owner-terms': { 'owner.type': 1, 'owner.id': 1, _terms: 1 },
        _needsSearchIndex_1: [{ _needsSearchIndex: 1 }, { sparse: true }],
```

Add exactly the same three lines to the `applications` block.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx playwright test --project=unit tests/features/text-search/facade.unit.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Lint and commit**

```bash
npx eslint api/src tests/features/text-search --fix
git add api/src/misc/utils/text-search api/src/mongo.ts tests/features/text-search/facade.unit.spec.ts
git commit -m "feat(text-search): facade, configured collections and the term indexes"
```

---

### Task 7: Write path and response hygiene

**Files:**
- Modify: `api/src/datasets/utils/search-text.ts` (rename `searchTextPatch` → `searchIndexPatch`)
- Modify: `api/src/datasets/service.ts:379`, `api/src/datasets/service.ts:552`,
  `api/src/datasets/routes/metadata.ts:269`, `api/src/misc/utils/permissions.ts:387` (the four callers)
- Modify: `api/src/applications/service.ts` (index fields on create/patch)
- Modify: `api/src/datasets/utils/index.ts` (the `clean()` deletions, near line 200)
- Modify: `api/src/datasets/service.ts` and `api/src/applications/service.ts` (the `findUtils.project` exclude lists)
- Create: `api/src/misc/utils/text-search/mark-stale.ts`
- Test: `tests/features/text-search/response-hygiene.api.spec.ts`

**Interfaces:**
- Consumes: `datasetsTextSearch`, `applicationsTextSearch` from `collections.ts`;
  `INDEX_FIELD_NAMES`.
- Produces: `searchIndexPatch (dataset): Promise<{ _searchText: string | null, _terms: string[] | null, _pos: any, _len: any, _searchIndex: { v: number, at: string } }>`;
  `applicationIndexPatch (application): { _terms, _pos, _len, _searchIndex }`;
  `markStale (collection, filter): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/response-hygiene.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')
const INDEX_FIELDS = ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex']

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('search index fields stay server-side', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('never reach a datasets list response, whatever the projection', async () => {
    await metaOnly('rh-conso', { title: 'Consommation annuelle', description: 'Par commune' })
    // findUtils.project builds an EXCLUSION projection when `select` is absent, so any field it
    // does not name is returned — that is how these leak.
    for (const params of [{}, { select: 'title,description' }, { raw: 'true' }]) {
      const res = (await u1.get('/api/v1/datasets', { params })).data
      assert.ok(res.results.length > 0, 'the fixture must return rows or this proves nothing')
      for (const dataset of res.results) {
        for (const field of INDEX_FIELDS) {
          assert.equal(dataset[field], undefined, `${field} leaked with params ${JSON.stringify(params)}`)
        }
      }
    }
  })

  test('never reach a single dataset GET', async () => {
    await metaOnly('rh-single', { title: 'Courbe de charge' })
    const dataset = (await u1.get('/api/v1/datasets/rh-single')).data
    for (const field of INDEX_FIELDS) assert.equal(dataset[field], undefined)
  })

  test('never reach an applications list response', async () => {
    await u1.post('/api/v1/applications', { url: 'http://monapp1.com/', title: 'Application de consommation' })
    for (const params of [{}, { select: 'title' }]) {
      const res = (await u1.get('/api/v1/applications', { params })).data
      assert.ok(res.results.length > 0)
      for (const application of res.results) {
        for (const field of INDEX_FIELDS) assert.equal(application[field], undefined)
      }
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=api tests/features/text-search/response-hygiene.api.spec.ts`
Expected: FAIL — `_terms` is present, because `findUtils.project` builds an *exclusion*
projection and returns every field it does not name.

- [ ] **Step 3: Rename and extend `searchTextPatch`**

In `api/src/datasets/utils/search-text.ts`, replace `searchTextPatch` with:

```ts
import { datasetsTextSearch } from '../../misc/utils/text-search/collections.ts'

/** Everything derived from a dataset's indexed content. `null` values are `$unset`. */
export const searchIndexPatch = async (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }) => {
  const catalogSearch = await getCatalogSearchSettings(dataset.owner)
  const _searchText = computeSearchText(dataset, catalogSearch) ?? null
  // _searchText is one of the indexed fields, so it must be computed BEFORE the index is built
  const fields = datasetsTextSearch.buildIndexFields({ ...dataset, _searchText })
  return {
    _searchText,
    _terms: fields?._terms ?? null,
    _pos: fields?._pos ?? null,
    _len: fields?._len ?? null,
    _searchIndex: { v: datasetsTextSearch.definition.version, at: new Date().toISOString() }
  }
}
```

Update the INVARIANT comment at the top of the file: it currently guards `_searchText` only, and
must now cover the index fields as a whole.

Update the four callers to spread the whole patch rather than destructuring `_searchText` alone.
For example `api/src/datasets/service.ts:379` becomes:

```ts
  const searchIndex = await searchIndexPatch(dataset)
  Object.assign(patch, searchIndex)
```

Read each call site and apply the equivalent change; they differ in how they merge the patch.

- [ ] **Step 4: Add the applications write path**

In `api/src/applications/service.ts`, add and call on create and patch:

```ts
import { applicationsTextSearch } from '../misc/utils/text-search/collections.ts'

export const applicationIndexPatch = (application: any) => {
  const fields = applicationsTextSearch.buildIndexFields(application)
  return {
    _terms: fields?._terms ?? null,
    _pos: fields?._pos ?? null,
    _len: fields?._len ?? null,
    _searchIndex: { v: applicationsTextSearch.definition.version, at: new Date().toISOString() }
  }
}
```

- [ ] **Step 5: Add `mark-stale.ts`**

```ts
/**
 * Declare that documents need their search index recomputed, instead of recomputing inline.
 * This is the documented contract for bulk writers, upgrade scripts and anything touching the
 * database directly — a writer that skips it leaves the index silently stale, which is exactly
 * how `_searchText` acquired two stale paths before this existed.
 */
export const markStale = async (collection: { updateMany (filter: any, update: any): Promise<any> }, filter: any) => {
  await collection.updateMany(filter, { $set: { _needsSearchIndex: true } })
}
```

- [ ] **Step 6: Close the response leaks**

In `api/src/datasets/utils/index.ts`, beside `delete dataset._needsHistorizing`, add:

```ts
  for (const field of INDEX_FIELD_NAMES) delete (dataset as any)[field]
```

In `api/src/datasets/service.ts`, import `INDEX_FIELD_NAMES` and change the project exclude list to
`['_modified', '_searchText', ...INDEX_FIELD_NAMES]`.

In `api/src/applications/service.ts`, change it to
`['configuration', 'configurationDraft', ...INDEX_FIELD_NAMES]`.

Deriving both from the constant rather than retyping the names means a sixth stored field added
later cannot leak from a call site someone forgot.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test --project=api tests/features/text-search/response-hygiene.api.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Lint and commit**

```bash
npx eslint api/src tests/features/text-search --fix
git add api/src tests/features/text-search/response-hygiene.api.spec.ts
git commit -m "feat(text-search): write the index fields on dataset and application writes, and keep them out of responses"
```

---

### Task 8: Deferred recompute — worker task and rename marking

**Files:**
- Modify: `api/src/workers/tasks.ts` (add `applicationTasks`, change the `tasks` export)
- Modify: `api/src/workers/index.ts:75` (the resource-type loop) and `getFreeTasks`
- Modify: `api/src/workers/short-processor/index.ts` (add the task function)
- Modify: `api/src/identities/service.ts` (mark stale after the bulk rename)
- Test: `tests/features/text-search/recompute.api.spec.ts`

**Interfaces:**
- Consumes: `markStale`, `searchIndexPatch`, `applicationIndexPatch`.
- Produces: the worker task named `computeSearchIndex`, registered for both resource types.

- [ ] **Step 1: Write the failing test**

Create `tests/features/text-search/recompute.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl } from '../../support/axios.ts'
import { callWorkerFunction, getRawDataset } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}
const findable = async (q: string) => (await u1.get('/api/v1/datasets', { params: { q, select: 'id' } })).data

test.describe('deferred search-index recompute', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a document marked stale is reindexed by the worker and becomes searchable again', async () => {
    await metaOnly('rc-eolienne', { title: 'Parc eolien de Bretagne' })
    assert.equal((await findable('eolien')).count, 1, 'inline indexing should make it findable immediately')

    // simulate a bulk write that changed indexed content without recomputing: the index is stale
    // and the document declares it, exactly as markStale() would
    await anonymousAx.post(`${apiUrl}/api/v1/test-env/patch-dataset/rc-eolienne`, {
      _terms: [], _pos: {}, _len: {}, _needsSearchIndex: true
    })
    assert.equal((await findable('eolien')).count, 0, 'a cleared index must make it unfindable')

    const stale = await getRawDataset('rc-eolienne')
    await callWorkerFunction('shortProcessor', 'computeSearchIndex', stale)

    assert.equal((await findable('eolien')).count, 1, 'the worker must rebuild the index')
    const drained = await getRawDataset('rc-eolienne')
    assert.equal(drained._needsSearchIndex, undefined, 'the flag must be cleared')
    assert.ok(drained._terms.length > 0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=api tests/features/text-search/recompute.api.spec.ts`
Expected: FAIL — the dataset stays unfindable, because no task drains the flag.

- [ ] **Step 3: Register the task**

In `api/src/workers/tasks.ts`, add an `applicationTasks` array and the shared task entry:

```ts
const searchIndexTask = {
  name: 'computeSearchIndex',
  worker: 'shortProcessor' as const,
  // Single sparse-indexable predicate on purpose: an $or against a sparse index selects badly.
  // No eventsPrefix — this is bookkeeping, not user-visible activity, so it writes no journal.
  mongoFilter: () => ({ _needsSearchIndex: true })
}

const applicationTasks: DatasetTask[] = [searchIndexTask]

export const tasks = { datasets: datasetTasks, applications: applicationTasks }
```

and push `searchIndexTask` into `datasetTasks` as well.

- [ ] **Step 4: Widen the worker loop**

In `api/src/workers/index.ts`, change `getFreeTasks` to take the resource type:

```ts
const getFreeTasks = (type: ResourceType) => {
  const workersStatus = getWorkersStatus()
  return (tasks[type as keyof typeof tasks] ?? [])
    .filter(task => workersStatus.some(w => w.key === task.worker && w.currentConcurrency < w.maxConcurrency))
    .map(task => ({ task, excludedOwners: workersStatus.find(w => w.key === task.worker)!.excludedOwners }))
}
```

and at line 75 change the loop to `for (const type of ['datasets', 'applications'] as ResourceType[])`,
calling `getFreeTasks(type)`.

- [ ] **Step 5: Implement the task**

In `api/src/workers/short-processor/index.ts`:

```ts
export const computeSearchIndex = async function (resource: any) {
  await mongo.connect(true)
  const isDataset = !!resource.schema || resource.isRest !== undefined
  if (isDataset) {
    const { searchIndexPatch } = await import('../../datasets/utils/search-text.ts')
    const patch = await searchIndexPatch(resource)
    await mongo.datasets.updateOne({ id: resource.id }, { $set: patch, $unset: { _needsSearchIndex: '' } })
  } else {
    const { applicationIndexPatch } = await import('../../applications/service.ts')
    await mongo.applications.updateOne({ id: resource.id }, { $set: applicationIndexPatch(resource), $unset: { _needsSearchIndex: '' } })
  }
}
```

Replace the `isDataset` heuristic with the resource type if the worker passes it; read how
`processResourceTask` invokes `workers[task.worker].run(resource, { name: task.name })` and, if the
type is not available to the task function, pass it through in the same change.

- [ ] **Step 6: Mark stale on rename**

In `api/src/identities/service.ts` `renameIdentity`, after the two `updateMany` calls that set
`owner.name` and `owner.departmentName`, add for the collections that carry a text index:

```ts
    if (c === 'datasets' || c === 'applications') {
      // owner.name and owner.departmentName are indexed, so the bulk $set above just staleified
      // every owner-name token; the worker recomputes them.
      await markStale(collection, ownerFilter)
    }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test --project=api tests/features/text-search/recompute.api.spec.ts`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
npx eslint api/src tests/features/text-search --fix
git add api/src tests/features/text-search/recompute.api.spec.ts
git commit -m "feat(text-search): deferred recompute via a worker task on datasets and applications"
```

---

### Task 9: Backfill upgrade script

**Files:**
- Create: `api/upgrade/6.20.0/02-backfill-search-index.ts`
- Rename: `api/upgrade/6.20.0/backfill-search-text.ts` → `api/upgrade/6.20.0/01-backfill-search-text.ts`

**Interfaces:**
- Consumes: `datasetsTextSearch`, `applicationsTextSearch`, `computeSearchText`.
- Produces: nothing importable; it is a migration.

The folder is `6.20.0` because that is `package.json`'s current version, i.e. the last released
one. The numeric prefixes make this script run after the existing `_searchText` backfill, which it
depends on.

- [ ] **Step 1: Rename the existing script so ordering is explicit**

```bash
git mv api/upgrade/6.20.0/backfill-search-text.ts api/upgrade/6.20.0/01-backfill-search-text.ts
```

- [ ] **Step 2: Write the backfill**

Create `api/upgrade/6.20.0/02-backfill-search-index.ts`:

```ts
import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import type { AnyBulkWriteOperation, Db } from 'mongodb'
import { datasetsTextSearch, applicationsTextSearch } from '../../src/misc/utils/text-search/collections.ts'
import type { TextSearch } from '../../src/misc/utils/text-search/index.ts'

// Runs inline rather than lazily: a document without `_terms` is invisible to search, so leaving
// the drain to the worker would break search for the whole drain. Upgrade scripts run before the
// HTTP server accepts traffic, so finishing here guarantees correctness from the first request.
const backfill = async (db: Db, collectionName: string, textSearch: TextSearch, debug: (msg: string) => void) => {
  const collection = db.collection(collectionName)
  const version = textSearch.definition.version
  // idempotent: everything already at the current version is skipped, so a re-run — or a run
  // resumed after a crash — only fills the remaining gaps
  await collection.updateMany({ '_searchIndex.v': { $ne: version } }, { $set: { _needsSearchIndex: true } })

  let stamped = 0
  const ops: AnyBulkWriteOperation<any>[] = []
  const flush = async () => {
    if (!ops.length) return
    await collection.bulkWrite(ops, { ordered: false })
    stamped += ops.length
    ops.length = 0
  }
  for await (const doc of collection.find({ _needsSearchIndex: true })) {
    const fields = textSearch.buildIndexFields(doc)
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            _terms: fields?._terms ?? null,
            _pos: fields?._pos ?? null,
            _len: fields?._len ?? null,
            _searchIndex: { v: version, at: new Date().toISOString() }
          },
          $unset: { _needsSearchIndex: '' }
        }
      }
    })
    if (ops.length >= 200) await flush()
  }
  await flush()
  debug(`stamped the search index on ${stamped} ${collectionName}`)
}

const upgradeScript: UpgradeScript = {
  description: 'Build the term/position search index on existing datasets and applications',
  async exec (db, debug) {
    await backfill(db, 'datasets', datasetsTextSearch, debug)
    await backfill(db, 'applications', applicationsTextSearch, debug)
  }
}

export default upgradeScript
```

- [ ] **Step 3: Verify it runs and is idempotent**

Run the API once against the dev database with `DEBUG=upgrade,upgrade:*`, confirm the script logs
a non-zero count, then restart and confirm it logs `0` the second time.

- [ ] **Step 4: Commit**

```bash
npx eslint api/upgrade --fix
git add api/upgrade
git commit -m "feat(text-search): backfill the term index on existing datasets and applications"
```

---

### Task 10: Switch the query path

**Files:**
- Modify: `api/src/misc/utils/find.ts` — `query()`, `sort()`, `basePipeline()`, `facetsQuery()`, `sumsQuery()`, plus a new exported `ownerScopeOf()`
- Modify: `api/src/datasets/service.ts:136-155` (the list query)
- Modify: `api/src/applications/service.ts:84-91` (the list query)
- Modify: `tests/features/datasets/catalog-search.api.spec.ts` (expectations that assumed `$text`)

**Interfaces:**
- Consumes: `datasetsTextSearch` / `datasetsStats`, `applicationsTextSearch` / `applicationsStats`.
- Produces: `findUtils.query(..., textFilter?: any)`, `findUtils.facetsQuery(..., textFilter?: any)`,
  `findUtils.sumsQuery(..., textFilter?: any)`, `findUtils.sort(sortStr, q, relevanceSort?: Record<string, number>)`,
  `findUtils.ownerScopeOf(reqQuery, publicationSite?): Record<string, any> | undefined`.

- [ ] **Step 1: Add the `textFilter` parameter in `find.ts`**

In `query()`, replace

```ts
  if (reqQuery.q) {
    query.$text = { $search: reqQuery.q }
  }
```

with

```ts
  // Collections with their own text engine pass `textFilter`; the rest keep $text.
  if (textFilter) Object.assign(query, textFilter)
  else if (reqQuery.q) query.$text = { $search: reqQuery.q }
```

adding `textFilter?: any` as the last parameter. Do the same in `basePipeline()` and thread a
`textFilter` parameter through `facetsQuery()` and `sumsQuery()` to it.

In `sort()`, replace `if (q) sort._score = { $meta: 'textScore' }` with

```ts
  if (q) Object.assign(sort, relevanceSort ?? { _score: { $meta: 'textScore' } })
```

adding `relevanceSort?: Record<string, number>` as a third parameter.

- [ ] **Step 2: Switch the datasets list query**

In `api/src/datasets/service.ts`, before building `query`:

First add `ownerScopeOf` to `api/src/misc/utils/find.ts` and export it — both services need it:

```ts
/**
 * The single-owner scope of a request, or undefined when it spans owners.
 *
 * Corpus statistics and the candidate gate are both scoped to this when it is set, which is the
 * largest scaling lever in the design: on a 200k-document instance an owner-scoped portal query
 * examines 321 documents instead of 62,360, because the compound {owner.type, owner.id, _terms}
 * index gates by owner first. Returning undefined is always CORRECT, only slower — so anything
 * ambiguous must return undefined rather than guess an owner.
 */
export const ownerScopeOf = (reqQuery: Record<string, string>, publicationSite?: { owner: { type: string, id: string } }): Record<string, any> | undefined => {
  if (publicationSite) return { 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id }
  if (!reqQuery.owner) return undefined
  const owners = reqQuery.owner.split(',')
  // several owners, or a negation like `-organization:x`, is not a single-owner scope
  if (owners.length !== 1 || owners[0].startsWith('-')) return undefined
  const [type, id] = owners[0].split(':')
  if (!type || !id) return undefined
  return { 'owner.type': type, 'owner.id': id }
}
```

Then, in the service, before building `query`:

```ts
  const ownerScope = ownerScopeOf(reqQuery, publicationSite)
  const plan = reqQuery.q ? await datasetsTextSearch.plan(reqQuery.q, datasetsStats, ownerScope) : null
  // A query whose every term is unknown must return NOTHING, never an unfiltered list.
  const textFilter = reqQuery.q ? (plan ? datasetsTextSearch.matchFilter(plan) : { _id: null }) : undefined
```

Pass `textFilter` to `findUtils.query`, `findUtils.facetsQuery` and `findUtils.sumsQuery`, and
pass `datasetsTextSearch.sortSpec()` as `sort()`'s third argument.

Then run the results query as an aggregation only when the score is used:

```ts
  const relevanceSorted = !!plan && !reqQuery.sort
  const resultsPromise = size > 0 && (relevanceSorted
    ? datasets.aggregate([
      { $match: query },
      { $addFields: { _score: datasetsTextSearch.scoreExpression(plan) } },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      { $project: project }
    ], { collation: { locale: 'en' } }).toArray()
    : datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray())
```

- [ ] **Step 3: Switch the applications list query**

Apply the same three changes in `api/src/applications/service.ts`, using
`applicationsTextSearch` and `applicationsStats`.

- [ ] **Step 4: Update the existing catalog-search expectations**

Run `npx playwright test --project=api tests/features/datasets/catalog-search.api.spec.ts` and fix
each failure. Expect at least:
- a fixture whose tag starts with `-` now parses as a negation (see the spec's §5); rename the
  fixture rather than changing the parser
- ranking assertions that depended on `$text` ordering

- [ ] **Step 5: Verify**

```bash
npx playwright test --project=api tests/features/datasets/catalog-search.api.spec.ts
npx playwright test --project=api tests/features/applications
```
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint api/src tests --fix
git add api/src tests
git commit -m "feat(text-search): serve q= on datasets and applications from the term index"
```

---

### Task 11: The silent-failure tests and the architecture doc

**Files:**
- Create: `tests/features/text-search/search-behaviour.api.spec.ts`
- Create: `docs/architecture/catalog-search.md`
- Modify: `AGENTS.md` (add the new doc to the architecture list)

- [ ] **Step 1: Write the four remaining silent-failure tests**

Create `tests/features/text-search/search-behaviour.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}
const search = async (params: Record<string, any>) =>
  (await u1.get('/api/v1/datasets', { params: { select: 'id', ...params } })).data

test.describe('catalog search behaviour', () => {
  test.beforeEach(async () => {
    await clean()
    await metaOnly('sb-conso-gaz', { title: 'Consommation annuelle de gaz' })
    await metaOnly('sb-conso-elec', { title: 'Consommation annuelle electrique' })
    await metaOnly('sb-courbe', { title: 'Courbe de charge des clients', description: 'Courbe de charge mesuree' })
    await metaOnly('sb-autre', { title: 'Repertoire des communes' })
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a query whose every term is unknown returns NOTHING, not everything', async () => {
    // the catastrophic failure: a null plan rendered as "no text filter" would return the catalog
    assert.ok((await search({})).count >= 4, 'the fixture must have datasets')
    const res = await search({ q: 'zzqxnotacorpusterm' })
    assert.equal(res.count, 0)
    assert.equal(res.results.length, 0)
  })

  test('count agrees with the results length, including for a phrase query', async () => {
    for (const q of ['consommation', '"courbe de charge"']) {
      const res = await search({ q, size: 100 })
      assert.equal(res.count, res.results.length, `count disagrees with results for q=${q}`)
    }
  })

  test('a phrase requires adjacency, a loose query does not', async () => {
    const phrase = await search({ q: '"courbe de charge"' })
    assert.deepEqual(phrase.results.map((r: any) => r.id), ['sb-courbe'])
    const loose = await search({ q: 'courbe charge' })
    assert.ok(loose.count >= 1)
  })

  test('a negated term excludes, and a query of only negations returns nothing', async () => {
    const all = await search({ q: 'consommation', size: 100 })
    assert.equal(all.count, 2)
    const negated = await search({ q: 'consommation -gaz', size: 100 })
    assert.deepEqual(negated.results.map((r: any) => r.id), ['sb-conso-elec'])
    assert.equal((await search({ q: '-consommation' })).count, 0)
  })

  test('tied scores return a stable order across identical calls', async () => {
    // sb-conso-gaz and sb-conso-elec have the same shape, so "consommation annuelle" ties them
    const once = await search({ q: 'consommation annuelle', size: 20 })
    const twice = await search({ q: 'consommation annuelle', size: 20 })
    assert.deepEqual(once.results.map((r: any) => r.id), twice.results.map((r: any) => r.id))
  })
})
```

- [ ] **Step 2: Run them**

Run: `npx playwright test --project=api tests/features/text-search/search-behaviour.api.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Write the architecture doc**

Create `docs/architecture/catalog-search.md` covering: what `q=` does on datasets and applications
now, the stored index fields and what writes them, the two-tier recompute (inline vs
`_needsSearchIndex`), the `markStale` contract for anyone writing to the database directly, the
owner-scoped statistics, and the fact that `remote-services` and `base-applications` still use
`$text`. Link the spec for the reasoning and `benchmark/catalog-search/ENGINE-OPTIONS.md` for the
evidence.

- [ ] **Step 4: Register the doc**

Add to the architecture list in `AGENTS.md`:

```markdown
- [Catalog search](docs/architecture/catalog-search.md) — how `q=` ranks datasets and applications: the owned term index, dis_max BM25 scored in the aggregation, the `markStale` contract for bulk writers. **Read before touching `q=`, `find.ts`, or anything writing dataset/application metadata.**
```

- [ ] **Step 5: Run the gate and commit**

```bash
npm run lint
bash dev/check-types-ratchet.sh
npx playwright test --project=unit tests/features/text-search
git add tests docs AGENTS.md
git commit -m "test(text-search): cover the silent failures, and document the catalog search"
```

---

## Verification before completion

Run the full gate once every task is done — it is long, so run it only at the end:

```bash
npm run lint
bash dev/check-types-ratchet.sh    # must report no increase over the 431 baseline
npx playwright test --project=unit
npx playwright test --project=api
```

The type ratchet is non-deterministic against stale generated types. If it reports an unexpected
increase, bust the cache first:

```bash
rm -f node_modules/.cache/@data-fair/lib-types-builder/hashes.json && npm run build-types
```

## Follow-ups, deliberately not in this plan

- Remove the `fulltext` text index (`fulltext: null` in `api/src/mongo.ts`) in a **later** release,
  once no rolling-deploy pod still issues `$text` queries.
- Search-as-you-type (`q_mode=complete`) — costed in the spec's §12, deferred because raw prefix
  forms are additive and can be added later without breaking search.
- Extraction to `~/data-fair/lib`: the pure modules to `@data-fair/lib-utils`, `stats.ts` to
  `@data-fair/lib-node`.
