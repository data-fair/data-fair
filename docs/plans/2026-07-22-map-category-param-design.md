# Design — simple preview params, starting with `?category=` on maps

Date: 2026-07-22 · Branch: `feat-map-legend` · Status: validated design, pre-implementation

## Goal & convention

Dataset previews (map, table, …) accept flat, documented query params — the same
family as the existing `cols`, `sort`, `q`, `<field>_<op>` — readable and
writable **from outside**: portal iframes and AI-agent-crafted links are the
primary authors; UI widgets to set them may come later. No JSON configs.

First new param: **`category=<field key>`** on the map preview (both
`/dataset/{id}/map` and `/embed/dataset/{id}/map`). It declares that the field
carries the information distinguishing data items. The map derives per-value
feature colors and a legend from it.

## Data flow

- Map pages bind `category` with `useStringSearchParam` and pass it as a prop
  to `dataset-map.vue`.
- Validation: the field must exist in the dataset schema and be categorical
  (string/boolean/low-cardinality number, capped cardinality — same spirit as
  `tiles.defaultSelect`).
  Invalid or ineligible values degrade gracefully: the map renders as today
  with no error screen, plus a small warning where the legend would be.
- `dataset-map.vue` adds the category field to the vector-tile `select`
  (currently hard-coded to `_id`, `dataset-map.vue:95`) so the value lands in
  tile feature properties.
- Distinct values fetched once from
  `GET /datasets/{id}/values-labels/{field}` (value + human label), capped at
  **12**; values beyond the cap get a neutral "Other" color and a trailing
  legend entry.

## Coloring — theme-derived palette

New util `categoryPalette(primaryColor, n, theme)` in `ui/src` (candidate for
promotion to `@data-fair/lib` later):

1. **Hue rotation**: distribute n hues evenly around the wheel starting from
   the theme primary's hue (tinycolor2 `.spin()`), with a saturation floor so
   desaturated/grey primaries still yield distinguishable colors.
2. **Contrast alignment**: adjust each color with the `getReadableColor`
   logic from `@data-fair/lib-common-types/theme` (iterative darken/brighten
   until WCAG-readable) against the relevant backgrounds (light basemap /
   theme background; legend chips sit on a surface card).

No new dependency (tinycolor2 already present). Colors are deterministic for
a given dataset + field; they shift when the distinct-value count changes,
which is inherent to even distribution and accepted.

`use-map-style.ts` replaces the flat `primary`/`accent` paint values with
MapLibre `['match', ['get', field], v1, c1, …, otherColor]` expressions on the
point/line/polygon layers when a category is active.

## Legend

New component `dataset-map-legend.vue`: overlay card on the map, one
swatch + label row per value (+ "Other" when applicable).

Interactive: clicking an entry toggles a `<field>_in` filter through the
existing `useFilters` plumbing — legend clicks are URL-synced, shareable and
consistent with the API filter model. Filtered-out entries render dimmed.

## AI agent & docs

- Document `category` in `agent-tools/_utils.ts` (link-building guidance) so
  the data-exploration subagent can append `&category=<field>` to `/map?…`
  links. The `get_field_values` tool already lets the agent check cardinality
  before using a field.
- Update `docs/architecture/agent-integration.md` and
  `docs/architecture/map-tiles.md`.

## Dev fixture

Reuse `fixtures-equipements` (geo points, already has a categorical `type`
column: Administration, Culture, Transport, Éducation):

- Enrich the CSV with more rows so the categorized map reads well.
- Add markdown links in the dataset description demonstrating the capability
  (back-office map page and embed page with `?category=type`).
- The fixtures script's title/description-fixing pass re-applies on each run,
  so existing dev environments pick the description up without reseeding.

## Testing

- Unit tests for `categoryPalette` (hue distribution, saturation floor,
  contrast alignment, determinism).
- e2e/component check: `?category=` produces a match-expression style and a
  legend; legend clicks write `<field>_in` to the URL; invalid field degrades
  gracefully.

## Decisions log

- Primary authors: external link authors (portals, AI agents); UI pickers later.
- Param name: `category` (semantic role, leaves room for `?size=`, `?label=`…),
  over `color-by`/`legend`.
- v1 field types: categorical only (strings, booleans, low-cardinality
  numbers); numeric binning/graduated palettes later, likely a distinct param.
- Legend: clickable → `<field>_in` filters (not client-side visibility toggle).
- Palette: theme-derived hue rotation + contrast alignment reusing
  `getReadableColor`, chosen over a fixed curated palette and over
  Material-style harmonization.
