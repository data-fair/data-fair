import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// collections.ts is data-fair's wiring layer for the text-search util: it pulls in '#config',
// which (via the `config` npm package) only resolves its config directory relative to
// process.cwd() unless NODE_CONFIG_DIR is set — and the live api process runs with cwd=api/,
// while this unit test runs from the repo root. Point it at the real api/config directory so the
// SAME config the running server uses (dotenv/config already populated the env-var overrides
// custom-environment-variables.cjs reads) backs these assertions, rather than a stand-in.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')
process.env.NODE_ENV ??= 'development'

const { datasetsTextSearch, applicationsTextSearch, analyzerLanguage } = await import('../../../api/src/misc/utils/text-search/collections.ts')

// Pins the exact regression that shipped silently: config.catalogSearch.language is a MongoDB
// text-index language name ('french'), which the analyzer does not understand on its own — feeding
// it straight through disables stemming AND stopword removal without any error, only a quietly
// degraded index. Asserting the stemmed value (not just "some terms") is the point: a raw,
// un-stemmed, stopword-laden token list would also pass a looser assertion.
test('the shipped datasetsTextSearch analyzer actually stems and strips stopwords', () => {
  const fields = datasetsTextSearch.buildIndexFields({ title: 'Les eoliennes de la commune' })!
  assert.deepEqual(fields._terms, ['eolien', 'commun'])
})

test('the shipped applicationsTextSearch analyzer actually stems and strips stopwords', () => {
  const fields = applicationsTextSearch.buildIndexFields({ title: 'Les eoliennes de la commune' })!
  assert.deepEqual(fields._terms, ['eolien', 'commun'])
})

test('analyzerLanguage maps known mongo text-index language names to ISO codes', () => {
  assert.equal(analyzerLanguage('french'), 'fr')
  assert.equal(analyzerLanguage('english'), 'en')
  // 'none' is a deliberate no-stemming/no-stopwords degradation, matching the config doc comment
  // for catalogSearch.language — not the silent-failure case this whole fix is about.
  assert.equal(analyzerLanguage('none'), 'none')
})

test('analyzerLanguage throws on an unsupported language, naming the offending value', () => {
  assert.throws(() => analyzerLanguage('klingon'), /klingon/)
})
