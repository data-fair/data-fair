import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import tinycolor from 'tinycolor2'
import { MAX_CATEGORY_VALUES, isCategoryEligible, categoryPalette, categoryMatchExpression } from '../../../ui/src/components/dataset/map/category.ts'

const LIGHT_BGS = ['#FAFAFA', '#FFFFFF']

test.describe('isCategoryEligible', () => {
  test('accepts plain strings, booleans and numbers', () => {
    assert.equal(isCategoryEligible({ key: 'type', type: 'string' }), true)
    assert.equal(isCategoryEligible({ key: 'actif', type: 'boolean' }), true)
    assert.equal(isCategoryEligible({ key: 'niveau', type: 'integer' }), true)
    assert.equal(isCategoryEligible({ key: 'note', type: 'number' }), true)
  })

  test('rejects dates, geometry, multivalued, calculated and high-cardinality fields', () => {
    assert.equal(isCategoryEligible({ key: 'jour', type: 'string', format: 'date' }), false)
    assert.equal(isCategoryEligible({ key: 'quand', type: 'string', format: 'date-time' }), false)
    assert.equal(isCategoryEligible({ key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' }), false)
    assert.equal(isCategoryEligible({ key: 'tags', type: 'string', separator: ';' }), false)
    assert.equal(isCategoryEligible({ key: '_id', type: 'string' }), false)
    assert.equal(isCategoryEligible({ key: 'nom', type: 'string', 'x-cardinality': 51 }), false)
    assert.equal(isCategoryEligible({ key: 'ville', type: 'string', 'x-cardinality': 50 }), true)
    assert.equal(isCategoryEligible({ key: 'ext.error', type: 'string', 'x-calculated': true }), false)
    assert.equal(isCategoryEligible({ key: 'nom', type: 'string', 'x-capabilities': { values: false } }), false)
  })
})

test.describe('categoryPalette', () => {
  test('returns count distinct colors plus a neutral other color, deterministically', () => {
    const a = categoryPalette('#1976D2', 5, { bgColors: LIGHT_BGS, dark: false })
    const b = categoryPalette('#1976D2', 5, { bgColors: LIGHT_BGS, dark: false })
    assert.equal(a.colors.length, 5)
    assert.deepEqual(a, b)
    assert.equal(new Set([...a.colors, a.otherColor]).size, 6)
    // neutral: the other color is desaturated
    assert.ok(tinycolor(a.otherColor).toHsl().s < 0.15)
  })

  test('spreads hues evenly starting from the primary hue', () => {
    const { colors } = categoryPalette('#1976D2', 6, { bgColors: LIGHT_BGS, dark: false })
    const hues = colors.map(c => tinycolor(c).toHsl().h)
    // contrast alignment changes lightness only, so hues stay on the wheel positions
    const baseHue = tinycolor('#1976D2').toHsl().h
    hues.forEach((h, i) => {
      const expected = (baseHue + i * 60) % 360
      const dist = Math.min(Math.abs(h - expected), 360 - Math.abs(h - expected))
      assert.ok(dist < 2, `hue ${i}: ${h} vs expected ${expected}`)
    })
  })

  test('applies a saturation floor so a grey primary still yields colors', () => {
    const { colors } = categoryPalette('#808080', 4, { bgColors: LIGHT_BGS, dark: false })
    for (const c of colors) assert.ok(tinycolor(c).toHsl().s >= 0.4, `${c} is too grey`)
  })

  test('aligns every color to 3:1 contrast against the backgrounds', () => {
    for (const [bgs, dark] of [[LIGHT_BGS, false], [['#303030', '#424242'], true]] as const) {
      const { colors, otherColor } = categoryPalette('#1976D2', 8, { bgColors: [...bgs], dark })
      for (const c of [...colors, otherColor]) {
        for (const bg of bgs) {
          assert.ok(tinycolor.isReadable(c, bg, { level: 'AA', size: 'large' }), `${c} unreadable on ${bg} (dark=${dark})`)
        }
      }
    }
  })
})

test.describe('categoryMatchExpression', () => {
  test('builds a match expression on the stringified property', () => {
    const expr = categoryMatchExpression('type', [{ value: 'A', color: '#111111' }, { value: 'B', color: '#222222' }], '#999999')
    assert.deepEqual(expr, ['match', ['to-string', ['get', 'type']], 'A', '#111111', 'B', '#222222', '#999999'])
  })
})

test('MAX_CATEGORY_VALUES is 12', () => {
  assert.equal(MAX_CATEGORY_VALUES, 12)
})
