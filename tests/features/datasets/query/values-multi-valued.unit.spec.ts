import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { valuesIncludePattern, valuesIncludeClause, sameColumnExactValues, KEYWORD_IGNORE_ABOVE } from '../../../../api/src/datasets/es/operations.ts'

// helper: does a terms-agg `include` pattern accept this term? The pattern is a Lucene regexp
// matched against the WHOLE term, which JS reproduces with anchors — close enough to assert
// semantics here, the api spec checks the real ES behavior.
const accepts = (pattern: string, value: string) => new RegExp(`^(?:${pattern.replace(/&/g, '')})$`).test(value)

test.describe('values include pattern (multi-valued narrowing)', () => {
  test('prefix mode anchors at the start of the value', () => {
    const pattern = valuesIncludePattern('cinema', 'prefix') as string
    assert.ok(pattern.endsWith('.*'))
    assert.ok(accepts(pattern, 'cinema'))
    assert.ok(accepts(pattern, 'cinema d auteur'))
    assert.ok(!accepts(pattern, 'theatre'))
    assert.ok(!accepts(pattern, 'du cinema'))
  })

  test('contains mode matches anywhere in the value', () => {
    const pattern = valuesIncludePattern('cinema', 'contains') as string
    assert.ok(accepts(pattern, 'cinema'))
    assert.ok(accepts(pattern, 'du cinema en salle'))
    assert.ok(!accepts(pattern, 'theatre'))
  })

  test('folds case and diacritics in both directions', () => {
    for (const q of ['cinema', 'CINEMA', 'cinéma', 'CinÉma']) {
      const pattern = valuesIncludePattern(q, 'prefix') as string
      for (const value of ['cinema', 'Cinéma', 'CINEMA', 'cinèma']) {
        assert.ok(accepts(pattern, value), `q="${q}" should accept "${value}"`)
      }
      assert.ok(!accepts(pattern, 'theatre'), `q="${q}" should reject "theatre"`)
    }
  })

  test('escapes regexp special characters', () => {
    const pattern = valuesIncludePattern('a.b', 'prefix') as string
    assert.ok(accepts(pattern, 'a.b'))
    assert.ok(!accepts(pattern, 'axb'))
    const braced = valuesIncludePattern('a{2}', 'prefix') as string
    assert.ok(accepts(braced, 'a{2}'))
    assert.ok(!accepts(braced, 'aa'))
  })

  test('multi-word queries stay a single contiguous pattern', () => {
    // NEVER the lucene `&` intersection: intersecting N automata is exponential in N and
    // determinization is uninterruptible inside ES — a crafted query exhausted a node's heap
    const pattern = valuesIncludePattern('cinema d', 'prefix') as string
    assert.ok(!pattern.includes('&'), 'must not use the intersection operator')
    assert.ok(accepts(pattern, 'cinema d auteur'))
    assert.ok(!accepts(pattern, 'cinema'))

    const contains = valuesIncludePattern('d auteur', 'contains') as string
    assert.ok(!contains.includes('&'))
    assert.ok(accepts(contains, 'cinema d auteur'))
  })

  test('caps the pattern length so it cannot blow up the automaton', () => {
    assert.ok(valuesIncludePattern('x'.repeat(KEYWORD_IGNORE_ABOVE), 'contains'))
    assert.equal(valuesIncludePattern('x'.repeat(KEYWORD_IGNORE_ABOVE + 1), 'contains'), undefined)
    // 100 words used to build a 100-way intersection; now it is one linear pattern
    const manyWords = valuesIncludePattern(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '), 'contains') as string
    assert.ok(!manyWords.includes('&'))
  })

  test('declines queries carrying more wildcards than the automaton should hold', () => {
    // `.*a.*b.*c.*…` is the subset-construction blow-up, and the length cap does not bound it:
    // 200 characters of "a*b*c*" carry 100 `.*` segments
    assert.ok(valuesIncludePattern('a*b*c*', 'contains'))
    assert.equal(valuesIncludePattern('a*b*c*d*', 'contains'), undefined)
    assert.equal(valuesIncludePattern('a*b*'.repeat(50), 'contains'), undefined)
    // `?` becomes a plain `.`, no Kleene star, so it is not what needs bounding
    assert.ok(valuesIncludePattern('a?b?c?d?e?f?', 'contains'))
  })

  test('translates user wildcards instead of escaping them', () => {
    const pattern = valuesIncludePattern('cine*', 'prefix') as string
    assert.ok(accepts(pattern, 'cinema'))
    assert.ok(!accepts(pattern, 'theatre'))
    const single = valuesIncludePattern('cinem?', 'prefix') as string
    assert.ok(accepts(single, 'cinema'))
  })

  test('declines to narrow on queries that are not a literal reading', () => {
    // simple_query_string operators: a literal include would match nothing and empty the list
    assert.equal(valuesIncludePattern('cinema | sport', 'contains'), undefined)
    assert.equal(valuesIncludePattern('+cinema -sport', 'contains'), undefined)
    assert.equal(valuesIncludePattern('"cinema"', 'contains'), undefined)
    assert.equal(valuesIncludePattern('cinema~2', 'contains'), undefined)
    assert.equal(valuesIncludePattern('a.b (c)', 'contains'), undefined) // parentheses group in sqs
    // a hyphen inside a word is not a negation, it is part of the value
    assert.ok(valuesIncludePattern('saint-nazaire', 'contains'))
    assert.equal(valuesIncludePattern('', 'contains'), undefined)
    assert.equal(valuesIncludePattern('   ', 'contains'), undefined)
  })
})

const tags = { key: 'tags', type: 'string', separator: ',' }
const conceptTags = { ...tags, 'x-concept': { id: 'topic', primary: true } }
const singleValued = { key: 'tags', type: 'string' }

test.describe('same-column exact filter values', () => {
  test('reads _in and _eq on the listed column', () => {
    assert.deepEqual(sameColumnExactValues(tags, { tags_in: 'cinema,sport' }), ['cinema', 'sport'])
    assert.deepEqual(sameColumnExactValues(tags, { tags_eq: 'cinema' }), ['cinema'])
  })

  test('supports the quoted syntax for values holding a comma', () => {
    assert.deepEqual(sameColumnExactValues(tags, { tags_in: '"a,b","c"' }), ['a,b', 'c'])
    // malformed quoting is rejected by the row-filtering path in commons.ts, which 400s before
    // this list is ever consulted — here it simply means "nothing to narrow with"
    assert.equal(sameColumnExactValues(tags, { tags_in: '"a,b",c' }), undefined)
  })

  test('ignores filters on other columns', () => {
    assert.equal(sameColumnExactValues(tags, { city_eq: 'Paris' }), undefined)
    assert.equal(sameColumnExactValues(tags, {}), undefined)
    assert.equal(sameColumnExactValues(tags, { tags_in: '' }), undefined)
  })

  test('resolves the concept form used by dashboards', () => {
    assert.deepEqual(sameColumnExactValues(conceptTags, { _c_topic_in: 'cinema,sport' }), ['cinema', 'sport'])
    // a concept filter naming another concept is not this column's
    assert.equal(sameColumnExactValues(conceptTags, { _c_other_in: 'cinema' }), undefined)
  })

  test('_in wins over _eq when both are present', () => {
    assert.deepEqual(sameColumnExactValues(tags, { tags_in: 'a,b', tags_eq: 'c' }), ['a', 'b'])
  })
})

test.describe('values include clause (filter and q precedence)', () => {
  test('only narrows multi-valued columns', () => {
    assert.equal(valuesIncludeClause(singleValued, { tags_in: 'cinema' }, 'adapt'), undefined)
    assert.equal(valuesIncludeClause(singleValued, { q: 'cinema' }, 'adapt'), undefined)
  })

  test('an explicit value list becomes an exact include', () => {
    assert.deepEqual(valuesIncludeClause(tags, { tags_in: 'cinema,sport' }, 'adapt'), ['cinema', 'sport'])
    assert.deepEqual(valuesIncludeClause(tags, { tags_eq: 'cinema' }, 'adapt'), ['cinema'])
  })

  test('predicate filters become a pattern, with the right mode', () => {
    const starts = valuesIncludeClause(tags, { tags_starts: 'cine' }, 'adapt') as string
    assert.ok(accepts(starts, 'cinema') && !accepts(starts, 'du cinema'))
    const contains = valuesIncludeClause(tags, { tags_contains: 'cine' }, 'adapt') as string
    assert.ok(accepts(contains, 'du cinema'))
    const search = valuesIncludeClause(tags, { tags_search: 'cinema' }, 'adapt') as string
    assert.ok(accepts(search, 'du cinema'))
  })

  test('falls back to q, whose mode decides prefix or contains', () => {
    const complete = valuesIncludeClause(tags, { q: 'cine' }, 'complete') as string
    assert.ok(accepts(complete, 'cinema') && !accepts(complete, 'du cinema'))
    const adapt = valuesIncludeClause(tags, { q: 'cine' }, 'adapt') as string
    assert.ok(accepts(adapt, 'du cinema'))
    // the wildcard capability widens complete mode, mirroring its doc-level *q* clause
    const wildcard = valuesIncludeClause({ ...tags, 'x-capabilities': { wildcard: true } }, { q: 'cine' }, 'complete') as string
    assert.ok(accepts(wildcard, 'du cinema'))
  })

  test('precedence: an explicitly named value is never narrowed away', () => {
    // _in beats every predicate, and the predicates beat q
    assert.deepEqual(valuesIncludeClause(tags, { tags_in: 'cinema,sport', tags_starts: 'spo', q: 'zzz' }, 'adapt'), ['cinema', 'sport'])
    const starts = valuesIncludeClause(tags, { tags_starts: 'cine', tags_contains: 'zzz', q: 'zzz' }, 'adapt') as string
    assert.ok(accepts(starts, 'cinema'))
    const contains = valuesIncludeClause(tags, { tags_contains: 'cine', tags_search: 'zzz', q: 'zzz' }, 'adapt') as string
    assert.ok(accepts(contains, 'du cinema'))
  })

  test('nothing to narrow with negative filters or no query at all', () => {
    assert.equal(valuesIncludeClause(tags, {}, 'adapt'), undefined)
    // a negative filter removes every row holding the value, so it cannot leak
    assert.equal(valuesIncludeClause(tags, { tags_nin: 'cinema' }, 'adapt'), undefined)
    assert.equal(valuesIncludeClause(tags, { tags_neq: 'cinema' }, 'adapt'), undefined)
    // a filter on another column selects rows and must not touch the value list
    assert.equal(valuesIncludeClause(tags, { city_eq: 'Paris' }, 'adapt'), undefined)
  })
})
