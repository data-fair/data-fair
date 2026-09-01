import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { valuesIncludePattern, KEYWORD_IGNORE_ABOVE } from '../../../../api/src/datasets/es/operations.ts'

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
