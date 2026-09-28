import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { gettingStartedGuide } from '../../../api/contract/getting-started-guide.ts'

const SERVER_URL = 'https://example.com/api/v1/datasets/ds1'

// Minimal stand-in for a built doc: the guide only reads api.servers[0].url and the operationIds
// left in api.paths, so a doc is fully described by the operations that survived pruning.
const docWith = (...operationIds: string[]) => ({
  servers: [{ url: SERVER_URL }],
  info: { description: '' },
  paths: Object.fromEntries(operationIds.map((operationId, i) => [
    `/p${i}`,
    // a path-level `parameters` key sits next to the methods in a real doc — it must be skipped
    { parameters: [{ name: 'x' }], get: { operationId } }
  ]))
})

const ALL = ['readDescription', 'readSchema', 'readLines', 'getValuesAgg', 'getMetricAgg', 'downloadFullData']

test.describe('getting started guide', () => {
  test('a full dataset gets every bullet, with usable example URLs', () => {
    const guide = gettingStartedGuide(docWith(...ALL), { aggField: 'ma_colonne', hasBbox: true })
    assert.ok(guide.includes('**Par où commencer ?**'))
    for (const expected of ['**Obtenir les métadonnées**', '**Requêter les lignes**', '**Agréger**', '**Télécharger**', '**Carte / SIG**']) {
      assert.ok(guide.includes(expected), `missing bullet ${expected}`)
    }
    assert.ok(guide.includes(`${SERVER_URL}/lines?size=10&q=exemple`))
    assert.ok(guide.includes(`${SERVER_URL}/lines?format=pbf&xyz={x},{y},{z}`))
    assert.ok(guide.includes(`${SERVER_URL}/values_agg?field=ma_colonne&agg_size=10`))
  })

  // The guide is built from the finished doc precisely so it can't advertise a pruned route.
  test('only mentions operations still present in the doc', () => {
    const guide = gettingStartedGuide(docWith('readDescription', 'readSchema', 'downloadFullData'), { hasBbox: false })
    assert.ok(guide.includes('**Obtenir les métadonnées**'))
    assert.ok(guide.includes('**Télécharger**'))
    for (const absent of ['/lines', '/values_agg', '/metric_agg', '**Requêter les lignes**', '**Agréger**']) {
      assert.ok(!guide.includes(absent), `should not mention ${absent}`)
    }
  })

  // A meta-only dataset exposes neither /lines nor /schema: what is left doesn't orient anyone.
  test('is dropped entirely when fewer than two bullets survive', () => {
    assert.equal(gettingStartedGuide(docWith('readDescription'), { hasBbox: false }), '')
    assert.equal(gettingStartedGuide(docWith(), { hasBbox: true }), '')
  })

  test('no map bullet when /lines is gone, even on a geo dataset', () => {
    const guide = gettingStartedGuide(docWith('readDescription', 'readSchema', 'downloadFullData'), { hasBbox: true })
    assert.ok(!guide.includes('**Carte / SIG**'))
    assert.ok(!guide.includes('format=pbf'))
  })

  test('no map bullet when the dataset is not geographic', () => {
    const guide = gettingStartedGuide(docWith(...ALL), { aggField: 'a', hasBbox: false })
    assert.ok(guide.includes('**Requêter les lignes**'))
    assert.ok(!guide.includes('**Carte / SIG**'))
  })

  // metric without metric_field is silently ignored by the values agg, so the guide must not
  // suggest that `metric` alone produces anything.
  test('pairs metric with metric_field and never shows metric alone', () => {
    const guide = gettingStartedGuide(docWith(...ALL), { aggField: 'a', hasBbox: false })
    assert.ok(!guide.includes('metric=value_count'))
    assert.ok(guide.includes('`metric_field`'))
  })

  test('the metric_agg sentence stands alone when values_agg is filtered out', () => {
    const guide = gettingStartedGuide(docWith('readDescription', 'readLines', 'getMetricAgg'), { hasBbox: false })
    assert.ok(guide.includes('**Agréger**'))
    assert.ok(guide.includes('/metric_agg'))
    assert.ok(!guide.includes('/values_agg'))
  })

  test('the example column is url-encoded', () => {
    const guide = gettingStartedGuide(docWith(...ALL), { aggField: 'a b&c', hasBbox: false })
    assert.ok(guide.includes('field=a%20b%26c'))
    assert.ok(guide.includes('colonne `a b&c`'))
  })

  test('renders nothing without a server url to build examples from', () => {
    assert.equal(gettingStartedGuide({ paths: docWith(...ALL).paths }, { aggField: 'a', hasBbox: true }), '')
  })
})
