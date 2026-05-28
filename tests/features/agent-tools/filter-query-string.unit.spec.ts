import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildFilterQueryString } from '../../../agent-tools/_utils.ts'

test.describe('buildFilterQueryString', () => {
  test('returns undefined when no params', () => {
    assert.equal(buildFilterQueryString({}), undefined)
  })

  test('emits _c_q for full-text search (so URL sync to table/map works)', () => {
    const qs = buildFilterQueryString({ q: 'Paris' })
    assert.equal(qs, '_c_q=Paris')
  })

  test('emits _c_bbox / _c_geo_distance / _c_date_match', () => {
    const qs = buildFilterQueryString({
      bbox: '-2.5,43,3,47',
      geoDistance: '2.35,48.85,10km',
      dateMatch: '2024-01-01'
    })
    const params = new URLSearchParams(qs)
    assert.equal(params.get('_c_bbox'), '-2.5,43,3,47')
    assert.equal(params.get('_c_geo_distance'), '2.35,48.85,10km')
    assert.equal(params.get('_c_date_match'), '2024-01-01')
    assert.equal(params.get('bbox'), null)
    assert.equal(params.get('geo_distance'), null)
    assert.equal(params.get('date_match'), null)
  })

  test('column filters keep their suffix form (no _c_ prefix)', () => {
    const qs = buildFilterQueryString({ filters: { nom_search: 'Jean', age_lte: '30' } })
    const params = new URLSearchParams(qs)
    assert.equal(params.get('nom_search'), 'Jean')
    assert.equal(params.get('age_lte'), '30')
  })

  test('strips bare _geo_distance from sort and omits the param when empty', () => {
    const qs = buildFilterQueryString({ sort: '_geo_distance' })
    assert.equal(qs, undefined)
  })

  test('keeps sort/select unchanged', () => {
    const qs = buildFilterQueryString({ sort: 'name,-age', select: 'a,b' })
    const params = new URLSearchParams(qs)
    assert.equal(params.get('sort'), 'name,-age')
    assert.equal(params.get('select'), 'a,b')
  })

  test('combines everything into a URL-safe string', () => {
    const qs = buildFilterQueryString({
      q: 'hello',
      filters: { status_eq: 'active' },
      geoDistance: '2.35,48.85,10km'
    })
    const params = new URLSearchParams(qs)
    assert.equal(params.get('_c_q'), 'hello')
    assert.equal(params.get('status_eq'), 'active')
    assert.equal(params.get('_c_geo_distance'), '2.35,48.85,10km')
  })
})
