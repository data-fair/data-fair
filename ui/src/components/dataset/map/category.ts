import tinycolor from 'tinycolor2'
import { type ExpressionSpecification } from 'maplibre-gl'

export const MAX_CATEGORY_VALUES = 12

/** Structural subset of a dataset schema property — keeps this module free of
 * app-level imports so the unit test runner can load it directly. */
export type CategoryProperty = {
  key: string
  type?: string
  format?: string
  separator?: string
  title?: string
  'x-originalName'?: string
  'x-refersTo'?: string
  'x-cardinality'?: number
}

/** A field is usable as a map category if its values behave as a small discrete
 * set: same spirit as tiles.defaultSelect on the API side (strings capped at
 * cardinality 50), excluding dates, multivalued and calculated fields. */
export const isCategoryEligible = (property: CategoryProperty): boolean => {
  if (property.key.startsWith('_')) return false
  if (property.separator) return false
  if (property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
  if (property['x-cardinality'] !== undefined && property['x-cardinality'] > 50) return false
  if (property.type === 'boolean' || property.type === 'integer' || property.type === 'number') return true
  if (property.type === 'string') return property.format !== 'date' && property.format !== 'date-time'
  return false
}

// non-text contrast (WCAG 1.4.11, 3:1) — tinycolor expresses it as AA/large
const readableOpts: tinycolor.WCAG2Options = { level: 'AA', size: 'large' }

// same iterative alignment as getReadableColor in @data-fair/lib-common-types/theme,
// but with the 3:1 non-text ratio suited to map features (the lib hardcodes 4.5:1 text contrast)
const alignContrast = (color: tinycolor.Instance, bgColors: string[], dark: boolean) => {
  const c = color.clone()
  while (!bgColors.every(bg => tinycolor.isReadable(c, bg, readableOpts))) {
    if (dark) {
      if (c.getBrightness() === 255) break
      c.brighten(1)
    } else {
      if (c.getBrightness() === 0) break
      c.darken(1)
    }
  }
  return c
}

/** Theme-derived categorical palette: hues evenly distributed around the wheel
 * starting from the primary hue, with a saturation floor (so desaturated theme
 * primaries still produce distinguishable colors) and contrast alignment
 * against the given backgrounds. Deterministic for given inputs. */
export const categoryPalette = (primary: string, count: number, opts: { bgColors: string[], dark: boolean }): { colors: string[], otherColor: string } => {
  const base = tinycolor(primary).toHsl()
  const s = Math.max(base.s, 0.45)
  const l = Math.min(Math.max(base.l, 0.35), 0.65)
  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    const h = (base.h + (i * 360) / count) % 360
    colors.push(alignContrast(tinycolor({ h, s, l }), opts.bgColors, opts.dark).toHexString())
  }
  const otherColor = alignContrast(tinycolor({ h: base.h, s: 0.05, l: 0.6 }), opts.bgColors, opts.dark).toHexString()
  return { colors, otherColor }
}

/** MapLibre data-driven color expression for a categorized layer. The property
 * is stringified so string/number/boolean fields all match the (stringified)
 * values returned by the values-labels endpoint; a missing property stringifies
 * to "" and falls through to otherColor. items must not be empty. */
export const categoryMatchExpression = (fieldKey: string, items: { value: string, color: string }[], otherColor: string): ExpressionSpecification => {
  const expr: unknown[] = ['match', ['to-string', ['get', fieldKey]]]
  for (const item of items) expr.push(item.value, item.color)
  expr.push(otherColor)
  return expr as ExpressionSpecification
}
