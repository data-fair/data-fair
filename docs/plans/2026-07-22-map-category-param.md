# Map `?category=` Param & Legend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `?category=<field>` query param on the dataset map previews (back-office and embed) that colors features per value of the field with a theme-derived palette and shows an interactive legend, documented for AI-agent link building and demoed by a dev fixture.

**Architecture:** The map already serves vector tiles whose feature properties come from a `select` param (`ui/src/components/dataset/map/dataset-map.vue`). We add the category field to `select`, fetch its distinct values from `GET /datasets/{id}/values-labels/{field}` (capped at 12 + "Other"), generate colors with a new pure palette util (hue rotation from the theme primary + WCAG contrast alignment), swap the flat MapLibre paint colors for `['match', …]` expressions, and render a legend overlay whose clicks toggle a `<field>_in` filter through the existing `useFilters` URL sync. No server-side change.

**Tech Stack:** Vue 3 + Vuetify (ui workspace), MapLibre GL, tinycolor2 (new ui dep), Playwright (unit + e2e projects).

**Spec:** `docs/plans/2026-07-22-map-category-param-design.md`

## Global Constraints

- No new dependency other than `tinycolor2` (+ `@types/tinycolor2` dev). Hand-edit `package-lock.json` — a plain `npm install` churns ~12k lines in this repo.
- Never start/stop/restart dev processes — the user manages them via zellij. Check `bash dev/status.sh` before e2e runs; if services are down, report and stop.
- Type checking is gated by a ratchet (`dev/check-types-ratchet.sh`): no net-new tsc errors allowed.
- Cap: `MAX_CATEGORY_VALUES = 12` legend values, values beyond it colored with a neutral "Other" color. Values fetched with `stringify=true` and default (alphabetical) sort for deterministic color assignment.
- Invalid/ineligible `category` values degrade gracefully: map renders as today + small warning chip where the legend would be. No error screen.
- Legend click semantics: no filter = all values shown, full opacity. Clicking value(s) builds a `<field>_in` filter of the clicked values (single value normalizes to `_eq` via `addFilter`); clicking the last active value away removes the filter. The "Other" entry is informative only (not clickable) in v1.
- The contrast-alignment loop replicates `getReadableColor` from `@data-fair/lib-common-types/theme` but with the non-text 3:1 ratio (`{ level: 'AA', size: 'large' }`) — the lib function hardcodes `size: 'small'` (4.5:1 text contrast) which over-darkens map fills. Do NOT import the lib function. (Follow-up idea, out of scope: upstream a size option.)
- All UI copy in fr + en via the component `<i18n>` blocks, fr first (repo convention).

---

### Task 1: `tinycolor2` dependency (hand-edited lockfile)

**Files:**
- Modify: `ui/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `import tinycolor from 'tinycolor2'` resolvable from `ui/src` (Task 2) and from `tests/` (Task 2's unit spec).

- [ ] **Step 1: Get exact metadata for the lockfile entries**

Run:
```bash
npm view tinycolor2 version dist.integrity dist.tarball
npm view @types/tinycolor2 version dist.integrity dist.tarball
```
Expected: version `1.6.0` (or latest 1.x) and `1.4.6`-ish for the types, each with an `sha512-…` integrity and a registry tarball URL. Use whatever exact versions these commands print in the steps below.

- [ ] **Step 2: Add deps to ui/package.json**

In `ui/package.json`, add to `"dependencies"` (keep alphabetical order):
```json
    "tinycolor2": "^1.6.0",
```
and to `"devDependencies"` (alphabetical):
```json
    "@types/tinycolor2": "^1.4.6",
```

- [ ] **Step 3: Hand-edit package-lock.json**

Three edits (mirror an existing small package's entries for exact shape):
1. In the `"packages"` entry for the `ui` workspace (key `"ui"`), add `"tinycolor2": "^1.6.0"` to its `"dependencies"` object and `"@types/tinycolor2": "^1.4.6"` to its `"devDependencies"` object.
2. Add a top-level packages entry:
```json
    "node_modules/tinycolor2": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/tinycolor2/-/tinycolor2-1.6.0.tgz",
      "integrity": "<dist.integrity from Step 1>",
      "license": "MIT"
    },
```
3. Add the `node_modules/@types/tinycolor2` entry the same way (fields from Step 1, `"dev": true`).

Keys inside `"packages"` are alphabetically sorted — insert at the right spot.

- [ ] **Step 4: Materialize and verify minimal diff**

Run:
```bash
npm install
git diff --stat package.json ui/package.json package-lock.json
node -e "require('tinycolor2'); console.log('ok')"
```
Expected: `ok`, and the lockfile diff limited to the hand-made edits (a few dozen lines). If `npm install` churned the lockfile, `git checkout package-lock.json`, redo Step 3, and use `npm install --no-audit --no-fund` — report if churn persists.

- [ ] **Step 5: Commit**

```bash
git add ui/package.json package-lock.json
git commit -m "chore(ui): add tinycolor2 dependency"
```

---

### Task 2: pure category module (palette, match expression, eligibility) + unit tests

**Files:**
- Create: `ui/src/components/dataset/map/category.ts`
- Test: `tests/features/ui/map-category.unit.spec.ts`

**Interfaces:**
- Consumes: `tinycolor2` (Task 1).
- Produces (used by Tasks 3–4):
  - `MAX_CATEGORY_VALUES: number` (= 12)
  - `type CategoryProperty = { key: string, type?: string, format?: string, separator?: string, title?: string, 'x-originalName'?: string, 'x-refersTo'?: string, 'x-cardinality'?: number }` — structural subset of the dataset schema property, so this module has no `#api/types` import and stays importable from the unit test runner.
  - `isCategoryEligible(property: CategoryProperty): boolean`
  - `categoryPalette(primary: string, count: number, opts: { bgColors: string[], dark: boolean }): { colors: string[], otherColor: string }`
  - `categoryMatchExpression(fieldKey: string, items: { value: string, color: string }[], otherColor: string): ExpressionSpecification` — callers must not call it with empty `items` (MapLibre rejects a `match` with no branches).

**Notes:** pure module — no Vue, no auto-imports, only `tinycolor2` and a type-only `maplibre-gl` import, so the Playwright `unit` project can import it directly (same pattern as `tests/features/agent-tools/url-utils.unit.spec.ts` importing `ui/src/composables/agent/url-utils.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/features/ui/map-category.unit.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/ui/map-category.unit.spec.ts`
Expected: FAIL — cannot find module `ui/src/components/dataset/map/category.ts`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/components/dataset/map/category.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/map-category.unit.spec.ts`
Expected: PASS (all tests). If the saturation-floor or hue-spacing assertions fail because `alignContrast` pushed lightness to an extreme (possible on the dark-bg case), loosen only the implementation (e.g. raise the floor `s` to 0.5), not the 3:1 contrast assertions — contrast wins over prettiness.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/map/category.ts tests/features/ui/map-category.unit.spec.ts
git commit -m "feat(ui): category palette, eligibility and match-expression utils for map legend"
```

---

### Task 3: data-driven paint in the map style and controller

**Files:**
- Modify: `ui/src/components/dataset/map/use-map-style.ts`
- Modify: `ui/src/components/dataset/map/use-map.ts`

**Interfaces:**
- Consumes: nothing new (the expression type comes from `maplibre-gl`).
- Produces:
  - `useMapStyle(categoryExpr?: Ref<ExpressionSpecification | undefined>)` returning `{ style: string, dataLayers: ComputedRef<AddLayerObject[]> }` — when `categoryExpr.value` is set, the four data layers (`results_polygon` fill-color, `results_polygon_outline` line-color, `results_line` line-color, `results_point` circle-color) use it instead of the flat `primary`; hover/selected layers keep `primary`/`accent`.
  - `useMap(mapEl, tileUrl, selectable, selectedItem, noInteraction, cols, navigationPosition, bbox, t, categoryExpr?)` — same signature as today plus a trailing optional `categoryExpr: Ref<ExpressionSpecification | undefined>`; it live-applies expression changes with `setPaintProperty`.

**Notes:** no test of its own (MapLibre integration, covered by the Task 5 e2e). Verify with the type ratchet.

- [ ] **Step 1: Make dataLayers reactive to the category expression in use-map-style.ts**

Rewrite `ui/src/components/dataset/map/use-map-style.ts` — signature and layer array (`computed`) change; the layer definitions stay the same except the four color entries:

```ts
import { type AddLayerObject, type LegacyFilterSpecification, type DataDrivenPropertyValueSpecification, type ExpressionSpecification } from 'maplibre-gl'
import { useTheme } from 'vuetify'

export const useMapStyle = (categoryExpr?: Ref<ExpressionSpecification | undefined>) => {
  const theme = useTheme()
  const primary = theme.current.value.colors.primary as string
  const accent = theme.current.value.colors.accent as string

  // a relative "./" prefix is resolved against the site root, an absolute URL is used as is
  const style = $uiConfig.map.style.replace('./', `${$siteUrl}/`)

  const polygonFilter: LegacyFilterSpecification = ['==', '$type', 'Polygon']
  const lineStringFilter: LegacyFilterSpecification = ['==', '$type', 'LineString']
  const pointFilter: LegacyFilterSpecification = ['==', '$type', 'Point']
  const dataLayers = computed<AddLayerObject[]>(() => {
    const dataColor = categoryExpr?.value ?? primary
    return [{
      id: 'results_polygon',
      ...
      paint: {
        'fill-color': dataColor,
        'fill-opacity': 0.4
      },
      ...
```

Apply `dataColor` to exactly: `results_polygon` `fill-color`, `results_polygon_outline` `line-color`, `results_line` `line-color`, `results_point` `circle-color`. The `_hover` layers keep `primary`, `_selected` layers keep `accent`. Everything else (filters, widths, opacities, layout) is copied unchanged from the current file. Return `{ style, dataLayers }`.

- [ ] **Step 2: Use the reactive layers and live-apply expression changes in use-map.ts**

In `ui/src/components/dataset/map/use-map.ts`:

1. Extend the signature (trailing optional param) and pass it through:
```ts
export const useMap = (
  mapEl: Ref<HTMLElement | null>,
  tileUrl: Ref<string | undefined>,
  selectable: boolean,
  selectedItem: Ref<string>,
  noInteraction: boolean,
  cols: string[],
  navigationPosition: ControlPosition,
  bbox: Ref<LngLatBoundsLike | undefined>,
  t: (key: string) => string,
  categoryExpr?: Ref<ExpressionSpecification | undefined>
) => {
  const { sendUiNotif } = useUiNotif()
  const { style, dataLayers } = useMapStyle(categoryExpr)
```
(add `ExpressionSpecification` to the maplibre-gl type import.)

2. Replace the three `dataLayers.` usages with `dataLayers.value.` (`interactiveLayers.forEach` guard at ~line 161, the removal loop in the `tileUrl` watcher at ~line 185, the add loop in `initCustomSource` at ~line 210, and the `_selected` filter loop at ~line 216).

3. After the `tileUrl` watcher, add a watcher that live-applies the expression to already-added layers (the values-labels fetch usually resolves after the layers were added):
```ts
  // the category expression usually arrives after the layers were added
  // (values fetch resolving later than the tile url change) — apply it live
  const categoryPaint: Array<[string, 'fill-color' | 'line-color' | 'circle-color']> = [
    ['results_polygon', 'fill-color'],
    ['results_polygon_outline', 'line-color'],
    ['results_line', 'line-color'],
    ['results_point', 'circle-color']
  ]
  if (categoryExpr) {
    watch(categoryExpr, () => {
      const map = getMap()
      if (!map?.loaded) return
      for (const [layerId, prop] of categoryPaint) {
        if (map.getLayer(layerId)) {
          const layer = dataLayers.value.find(l => l.id === layerId) as AddLayerObject & { paint: Record<string, unknown> }
          map.setPaintProperty(layerId, prop, layer.paint[prop])
        }
      }
    })
  }
```
(add `AddLayerObject` to the imports from `./use-map-style`'s source — it comes from `maplibre-gl`.)

- [ ] **Step 3: Type-check**

Run: `bash dev/check-types-ratchet.sh`
Expected: no net-new errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/map/use-map-style.ts ui/src/components/dataset/map/use-map.ts
git commit -m "feat(ui): data-driven category colors in map style"
```

---

### Task 4: category prop in dataset-map.vue, legend component, page bindings

**Files:**
- Create: `ui/src/components/dataset/map/dataset-map-legend.vue`
- Modify: `ui/src/components/dataset/map/dataset-map.vue`
- Modify: `ui/src/pages/embed/dataset/[id]/map.vue`
- Modify: `ui/src/pages/dataset/[id]/map.vue`

**Interfaces:**
- Consumes: Task 2 exports (`MAX_CATEGORY_VALUES`, `isCategoryEligible`, `categoryPalette`, `categoryMatchExpression`), Task 3 signatures.
- Produces: `dataset-map` prop `category: string` (default `''`); legend component props/emits as defined below; both map pages bind `useStringSearchParam('category')`.

- [ ] **Step 1: Create the legend component**

Create `ui/src/components/dataset/map/dataset-map-legend.vue`:

```vue
<template>
  <v-card
    class="dataset-map-legend pa-2"
    style="position:absolute;bottom:24px;left:8px;z-index:2;max-height:50%;overflow-y:auto;max-width:280px;"
    density="compact"
  >
    <div
      class="text-subtitle-2 mb-1"
      style="line-height:1.2"
    >
      {{ title }}
    </div>
    <div
      v-for="item of items"
      :key="item.value"
      class="dataset-map-legend--item d-flex align-center"
      :style="{
        opacity: activeValues.length && !activeValues.includes(item.value) ? 0.4 : 1,
        cursor: clickable ? 'pointer' : 'default'
      }"
      @click="clickable && emit('toggle', item.value)"
    >
      <span
        class="mr-2 flex-shrink-0"
        :style="`display:inline-block;width:14px;height:14px;border-radius:3px;background-color:${item.color};`"
      />
      <span class="text-body-2 text-truncate">{{ item.label }}</span>
    </div>
    <div
      v-if="otherColor"
      class="d-flex align-center"
      style="opacity:0.8"
    >
      <span
        class="mr-2 flex-shrink-0"
        :style="`display:inline-block;width:14px;height:14px;border-radius:3px;background-color:${otherColor};`"
      />
      <span class="text-body-2 font-italic">{{ t('other') }}</span>
    </div>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  other: Autres valeurs
en:
  other: Other values
</i18n>

<script setup lang="ts">
const { t } = useI18n()

defineProps({
  title: { type: String, required: true },
  items: { type: Array as () => { value: string, label: string, color: string }[], required: true },
  activeValues: { type: Array as () => string[], default: () => [] },
  otherColor: { type: String, default: '' },
  clickable: { type: Boolean, default: false }
})
const emit = defineEmits<{ toggle: [value: string] }>()
</script>
```

(`bottom:24px` keeps it clear of the attribution strip.)

- [ ] **Step 2: Wire everything in dataset-map.vue**

In `ui/src/components/dataset/map/dataset-map.vue`:

1. Template — inside the root `div`, after the search field:
```vue
    <dataset-map-legend
      v-if="legend && categoryProperty"
      :title="categoryProperty.title || categoryProperty['x-originalName'] || categoryProperty.key"
      :items="legend.items"
      :active-values="activeValues"
      :other-color="hasOther ? legend.otherColor : ''"
      :clickable="!noInteraction"
      @toggle="toggleValue"
    />
    <v-chip
      v-else-if="categoryWarning"
      color="warning"
      variant="tonal"
      size="small"
      style="position:absolute;bottom:24px;left:8px;z-index:2;"
    >
      {{ t('categoryInvalid', { field: category }) }}
    </v-chip>
```

2. i18n block additions:
```yaml
fr:
  categoryInvalid: La colonne "{field}" ne permet pas de catégoriser la carte
en:
  categoryInvalid: Column "{field}" cannot be used to categorize the map
```

3. Script — imports and prop:
```ts
import { useTheme } from 'vuetify'
import { MAX_CATEGORY_VALUES, isCategoryEligible, categoryPalette, categoryMatchExpression } from './category'
```
Add to `defineProps` (and to the destructuring): `category: { type: String, default: '' }`.

4. Get the filter API (replace the current destructuring, keep `excludeKeys`):
```ts
const { filters, addFilter, removeFilter, queryParams: filtersQueryParams } = useFilters(dataset, { excludeKeys: ['_id_eq'] })
```

5. Category state, values fetch and palette (after `commonParams`):
```ts
const theme = useTheme()

const categoryProperty = computed(() => {
  if (!category || !dataset.value?.schema) return undefined
  const p = dataset.value.schema.find(p => p.key === category)
  return p && isCategoryEligible(p) ? p : undefined
})
// only warn once the schema is known and the field is truly unusable
const categoryWarning = computed(() => !!category && !!dataset.value?.schema && !categoryProperty.value)

const categoryValues = ref<{ value: string, label: string }[] | null>(null)
watch([categoryProperty, () => dataset.value?.finalizedAt], async () => {
  categoryValues.value = null
  const prop = categoryProperty.value
  if (!prop) return
  // stringified + alphabetical (default sort) for deterministic value -> color assignment,
  // fetched without the current filters so colors do not remap while filtering
  const params: Record<string, string> = { size: String(MAX_CATEGORY_VALUES + 1), stringify: 'true' }
  if (dataset.value?.draftReason) params.draft = 'true'
  const values = await $fetch(`datasets/${id}/values-labels/${prop.key}`, { params }) as { value: string, label: string }[]
  if (categoryProperty.value?.key === prop.key) categoryValues.value = values
}, { immediate: true })

const hasOther = computed(() => (categoryValues.value?.length ?? 0) > MAX_CATEGORY_VALUES)
const legend = computed(() => {
  if (!categoryValues.value?.length) return undefined
  const values = categoryValues.value.slice(0, MAX_CATEGORY_VALUES)
  const colors = theme.current.value.colors
  const { colors: palette, otherColor } = categoryPalette(colors.primary as string, values.length, {
    bgColors: [colors.background as string, colors.surface as string],
    dark: theme.current.value.dark
  })
  return { items: values.map((v, i) => ({ ...v, color: palette[i] })), otherColor }
})
const categoryExpr = computed(() => {
  if (!legend.value || !categoryProperty.value) return undefined
  return categoryMatchExpression(categoryProperty.value.key, legend.value.items, legend.value.otherColor)
})
```

6. Legend interactions (values parsed with the same quoting convention as `useFilters.addFilter`):
```ts
const categoryFilter = computed(() => filters.value.find(f =>
  f.property.key === categoryProperty.value?.key && (f.operator === 'in' || f.operator === 'eq')))
const activeValues = computed<string[]>(() => {
  const f = categoryFilter.value
  if (!f) return []
  if (f.operator === 'eq') return [f.value]
  return f.value.startsWith('"') ? JSON.parse(`[${f.value}]`) : f.value.split(',')
})
const toggleValue = (value: string) => {
  const prop = categoryProperty.value
  if (!prop) return
  const next = activeValues.value.includes(value)
    ? activeValues.value.filter(v => v !== value)
    : [...activeValues.value, value]
  if (!next.length) {
    if (categoryFilter.value) removeFilter(categoryFilter.value)
    return
  }
  const escaped = next.some(v => v.includes(',') || v.includes('"'))
    ? next.map(v => JSON.stringify(v)).join(',')
    : next.join(',')
  // addFilter replaces any existing in/eq filter on the field and normalizes single values to eq
  addFilter({ property: prop, operator: 'in', value: escaped, formattedValue: next.join(', ') })
}
```

7. Tile select — replace the `params.select = '_id'` line in `tileUrl`:
```ts
  const select: string[] = []
  if (dataset.value.schema?.find(p => p.key === '_id')) select.push('_id')
  if (categoryProperty.value) select.push(categoryProperty.value.key)
  if (select.length) params.select = select.join(',')
```

8. Pass the expression to the controller:
```ts
useMap(mapEl, tileUrl, selectable, selectedItem, noInteraction, cols, navigationPosition, computed(() => fetchBBOX.data.value?.bbox), t, categoryExpr)
```

- [ ] **Step 3: Bind the URL param in both pages**

`ui/src/pages/embed/dataset/[id]/map.vue` — add to the script:
```ts
const category = useStringSearchParam('category')
```
and to the template:
```vue
    <dataset-map
      v-model:q="q"
      v-model:selected-item="selectedItem"
      :height="windowHeight"
      :no-interaction="!interaction"
      :selectable="selectable"
      :cols="cols"
      :category="category"
    />
```

`ui/src/pages/dataset/[id]/map.vue` — same param, minimal binding:
```vue
    <dataset-map
      :height="contentHeight"
      :category="category"
    />
```
```ts
const category = useStringSearchParam('category')
```

- [ ] **Step 4: Lint and type-check**

Run:
```bash
npm run lint
bash dev/check-types-ratchet.sh
```
Expected: lint clean, no net-new type errors. Fix any violation before committing.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/map/dataset-map-legend.vue ui/src/components/dataset/map/dataset-map.vue 'ui/src/pages/embed/dataset/[id]/map.vue' 'ui/src/pages/dataset/[id]/map.vue'
git commit -m "feat(datasets): category param with per-value colors and legend on map previews"
```

---

### Task 5: e2e test on the embed map page

**Files:**
- Test: `tests/features/embed/dataset-map.e2e.spec.ts`

**Interfaces:**
- Consumes: the embed page binding + legend from Task 4; `tests/fixtures/login.ts` (`test`, `expect`, `goToWithAuth`), `tests/support/axios.ts` (`axiosAuth`, `clean`), `tests/support/workers.ts` (`sendDataset(fileName, ax, opts?, body?)`); resource `tests/resources/datasets/Antennes du CD22.csv` (has `lat`/`lon` and a categorical `ville` column).

- [ ] **Step 1: Check the dev stack is up**

Run: `bash dev/status.sh`
Expected: services healthy. If not, report to the user and stop this task (do not restart anything).

- [ ] **Step 2: Write the failing test**

Create `tests/features/embed/dataset-map.e2e.spec.ts`:

```ts
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

// geo CSV with a low-cardinality "ville" column; lat/lon tagged as geo concepts
// in the upload body so the map works without a post-upload schema patch
const geoBody = {
  schema: [
    { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
    { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
  ]
}

test.describe('embed dataset map page with category param', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('shows a legend and toggles filters from it', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/Antennes du CD22.csv', ax, undefined, geoBody)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/map?category=ville`, 'test_user1')

    // legend overlay: field title + one entry per value
    const legend = page.locator('.dataset-map-legend')
    await expect(legend).toBeVisible({ timeout: 10000 })
    await expect(legend.getByText('ville')).toBeVisible()
    await expect(legend.getByText('Dinan')).toBeVisible()
    await expect(legend.getByText('Guingamp')).toBeVisible()

    // first click: single value -> normalized to an eq filter in the URL
    await legend.getByText('Dinan').click()
    await expect(page).toHaveURL(/ville_eq=Dinan/)

    // second click: two values -> in filter
    await legend.getByText('Guingamp').click()
    await expect(page).toHaveURL(/ville_in=Dinan(%2C|,)Guingamp/)

    // unclick both: filter removed from the URL
    await legend.getByText('Guingamp').click()
    await legend.getByText('Dinan').click()
    await expect(page).not.toHaveURL(/ville_eq|ville_in/)
  })

  test('degrades gracefully on an ineligible category field', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/Antennes du CD22.csv', ax, undefined, geoBody)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/map?category=nope`, 'test_user1')

    await expect(page.getByText('La colonne "nope" ne permet pas de catégoriser la carte')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.dataset-map-legend')).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run the test**

Run: `npx playwright test tests/features/embed/dataset-map.e2e.spec.ts`
Expected: PASS if Task 4 is complete (write-then-run still validates the wiring; if it fails, debug with superpowers:systematic-debugging — likely suspects: legend text collisions with the popup/attribution, URL-encoding of the comma in `_in`, or the `ville` cardinality being > 50 in this file, in which case switch the category column or trim the CSV expectation accordingly — inspect the finalized schema's `x-cardinality` via the API before changing the component).

- [ ] **Step 4: Commit**

```bash
git add tests/features/embed/dataset-map.e2e.spec.ts
git commit -m "test(datasets): e2e coverage of the map category param and legend"
```

---

### Task 6: agent tools & architecture docs

**Files:**
- Modify: `agent-tools/dataset-data-subagent.ts` (link-writing guidance, ~line 31)
- Modify: `docs/architecture/agent-integration.md`
- Modify: `docs/architecture/map-tiles.md`

**Interfaces:** none (documentation/prompt only). Per the repo AGENTS.md, agent-behavior changes must be reflected in `docs/architecture/agent-integration.md`.

- [ ] **Step 1: Teach the data-exploration subagent the category param**

In `agent-tools/dataset-data-subagent.ts`, right after the line
`- Any table/map link you write must be datasetUrl + /table?<filterQuery> (or /map), reusing the verbatim filterQuery below — never hand-assemble \`column=value\` filter params, even if your task phrased the filter differently`
add:
```
- Map links additionally accept &category=<column_key>: the map then colors its features by that column's values and displays a legend. Offer it when the user wants to visually distinguish items on a map by a category-like column (string/boolean, few distinct values — at most ~12 render distinctly, check with get_field_values when unsure). Example: datasetUrl + /map?<filterQuery>&category=type
```

- [ ] **Step 2: Document in agent-integration.md**

In `docs/architecture/agent-integration.md`, find the paragraph describing ready-made `/table?<filterQuery>` and `/map?<filterQuery>` links (~line 128) and add a sentence in that section:
```
Map links also accept a `category=<column_key>` param (documented in the dataset_data subagent prompt): the map preview colors features per value of that column and shows an interactive legend, so the agent can hand out richer map links for categorical columns.
```
(Adapt placement to the actual surrounding list structure when editing.)

- [ ] **Step 3: Document in map-tiles.md**

Append a short section to `docs/architecture/map-tiles.md`:
```markdown
## Category coloring & legend (`?category=`)

The map previews (`/dataset/{id}/map` and `/embed/dataset/{id}/map`) accept a
`category=<field key>` query param: the field's values are fetched from
`GET /datasets/{id}/values-labels/{field}` (alphabetical, capped at 12 + an
"Other" bucket), each value gets a color from a theme-derived palette
(`ui/src/components/dataset/map/category.ts` — hue rotation from the theme
primary + 3:1 contrast alignment), the field is added to the vector-tile
`select` so it lands in tile feature properties, and the layers switch to
MapLibre `['match', …]` paint expressions. A legend overlay lists the values;
clicking an entry toggles a `<field>_in` filter through the standard URL-synced
filter params. Ineligible fields (dates, multivalued, geometry, calculated,
`x-cardinality` > 50) degrade to the uncategorized map plus a warning chip.

This is the first of the "simple preview params" family (flat, documented
query params usable from portal iframes and AI-agent links — no JSON configs);
see `docs/plans/2026-07-22-map-category-param-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add agent-tools/dataset-data-subagent.ts docs/architecture/agent-integration.md docs/architecture/map-tiles.md
git commit -m "docs(agents): document the map category param for link building"
```

---

### Task 7: dev fixture demo

**Files:**
- Modify: `dev/fixtures.ts` (`seedEquipements`)

**Interfaces:**
- Consumes: existing `uploadCsv(id, filename, body, csv)` and `datasetExists(id)` helpers, `dfBaseURL` / `dfAx` globals in that file.

- [ ] **Step 1: Enrich the equipements fixture and demo the links**

Replace `seedEquipements` in `dev/fixtures.ts` with a version that (a) has enough rows/types for a lively categorized map, (b) demos the links in the description, and (c) upgrades existing dev environments: the skip-if-exists check now also requires the description to carry the demo marker, otherwise the PUT (create/replace semantics of `uploadCsv`) re-runs.

```ts
/** Geo dataset: points on a map (public facilities). The lat/lon columns are
 * tagged with geo concepts in the upload body, so the map view works as soon as
 * indexing completes — no post-upload schema patch needed. Also demoes the map
 * `category` preview param: the description links to categorized map views.
 * Re-seeded (PUT create/replace) when the description lacks the demo links, so
 * existing dev envs upgrade on re-run. */
async function seedEquipements () {
  const id = 'fixtures-equipements'
  if (await datasetExists(id)) {
    const { data: current } = await dfAx.get(`/api/v1/datasets/${id}`, { params: { select: 'id,description' } })
    if (current.description?.includes('category=type')) { console.log(`${id}: skipped (exists)`); return }
  }
  const csv = [
    'nom,type,commune,lat,lon',
    'Mairie de Rennes,Administration,Rennes,48.1113,-1.6800',
    'Hôtel de Ville de Nantes,Administration,Nantes,47.2173,-1.5534',
    'Préfecture des Côtes-d\'Armor,Administration,Saint-Brieuc,48.5136,-2.7653',
    'Bibliothèque Champs Libres,Culture,Rennes,48.1045,-1.6759',
    'Opéra de Rennes,Culture,Rennes,48.1110,-1.6794',
    'Château des ducs de Bretagne,Culture,Nantes,47.2155,-1.5477',
    'Quartz de Brest,Culture,Brest,48.3897,-4.4849',
    'Gare de Brest,Transport,Brest,48.3876,-4.4783',
    'Gare de Rennes,Transport,Rennes,48.1033,-1.6725',
    'Port de Lorient,Transport,Lorient,47.7270,-3.3700',
    'Aéroport de Nantes Atlantique,Transport,Bouguenais,47.1569,-1.6078',
    'Université de Vannes,Éducation,Vannes,47.6587,-2.7603',
    'Université Rennes 2,Éducation,Rennes,48.1194,-1.7030',
    'Lycée naval de Brest,Éducation,Brest,48.4076,-4.4956',
    'CHU de Rennes Pontchaillou,Santé,Rennes,48.1194,-1.6924',
    'CHU de Nantes,Santé,Nantes,47.2094,-1.5525',
    'Hôpital de la Cavale Blanche,Santé,Brest,48.4022,-4.5266',
    'Stade Rennais Roazhon Park,Sport,Rennes,48.1075,-1.7129',
    'Stade de la Beaujoire,Sport,Nantes,47.2560,-1.5246',
    'Piscine olympique de Brest,Sport,Brest,48.4046,-4.4671'
  ].join('\n') + '\n'
  await uploadCsv(id, 'equipements.csv', {
    title: 'Équipements publics',
    description: 'Points géolocalisés affichables sur une carte (exemple géographique). ' +
      'Démonstration du paramètre de prévisualisation "category" (couleur par valeur + légende) : ' +
      `<a href="${dfBaseURL}/dataset/${id}/map?category=type">carte par type d'équipement</a>, ` +
      `<a href="${dfBaseURL}/embed/dataset/${id}/map?category=type">version intégrable (iframe)</a>, ` +
      `<a href="${dfBaseURL}/embed/dataset/${id}/map?category=type&type_in=Culture,Sport">pré-filtrée sur Culture et Sport</a>.`,
    schema: [
      { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
      { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
    ]
  }, csv)
  console.log(`${id}: seeded (geo)`)
}
```

Every CSV row must have exactly 5 columns — double-check for stray commas after pasting.

- [ ] **Step 2: Run the fixtures script and verify**

Run: `npm run dev-fixtures`
Expected: `fixtures-equipements: seeded (geo)` (not "skipped"), script ends with `Done.`. Re-run once more and expect `fixtures-equipements: skipped (exists)` (the demo-marker check makes the reseed idempotent).

Then verify visually with the playwright-cli skill (or ask the user to click through): open the dataset page printed by the script — the description shows the three links; the first map link renders colored points per `type` with a 6-entry legend; the pre-filtered link shows only Culture and Sport at full opacity (others dimmed).

- [ ] **Step 3: Commit**

```bash
git add dev/fixtures.ts
git commit -m "chore(dev): demo the map category param in the equipements fixture"
```

---

### Task 8: final verification

**Files:** none new.

- [ ] **Step 1: Full related test pass**

Run:
```bash
npx playwright test tests/features/ui/map-category.unit.spec.ts tests/features/embed/dataset-map.e2e.spec.ts tests/features/embed/dataset-table.e2e.spec.ts
npm run lint
bash dev/check-types-ratchet.sh
```
Expected: all green (`dataset-table.e2e.spec.ts` guards the shared `useFilters` behavior we now also drive from the map). Do NOT run the full suite — the pre-push husky hook does that.

- [ ] **Step 2: Update the design doc status**

In `docs/plans/2026-07-22-map-category-param-design.md`, change the `Status:` line to `implemented (see 2026-07-22-map-category-param.md)`.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-22-map-category-param-design.md
git commit -m "docs: mark map category param design as implemented"
```
