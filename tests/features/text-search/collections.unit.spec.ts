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

const { datasetsTextSearch, applicationsTextSearch } = await import('../../../api/src/misc/utils/text-search/collections.ts')
const config = (await import('../../../api/src/config.ts')).default

// Pins a regression that once shipped silently: an analyzer given a language it does not
// understand disables stemming AND stopword removal without any error, leaving only a quietly
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

test('the catalog search takes its language from the deployment default locale, not a setting of its own', () => {
  assert.equal(datasetsTextSearch.definition.language, config.i18n.defaultLocale)
  assert.equal(applicationsTextSearch.definition.language, config.i18n.defaultLocale)
})
