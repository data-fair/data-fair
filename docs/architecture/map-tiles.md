# Map base layer & tileserver

## Where the base map comes from

Dataset maps (UI map components under `ui/src/components/dataset/map/`)
render a MapLibre base layer whose style URL comes from the `map.style`
config key (`api/config/default.cjs`), shipped to the SPA through
`api/src/ui-config.ts` as `$uiConfig.map`.

- A value starting with `./` is resolved against the **site root**:
  `useMapStyle()` (`ui/src/components/dataset/map/use-map-style.ts`) rewrites
  it to `${$siteUrl}/...`. The default is
  `./tileserver/styles/klokantech-basic/style.json`.
- An absolute URL is used as is.

**Convention:** every environment that needs mapping capabilities runs the
`data-fair/tileserver` service (a full member of the stack, fed by the
`data-fair/registry`) and exposes it at the same-origin `/tileserver` path on
every mapped domain. data-fair itself has no tileserver URL configuration.

`map.beforeLayer` names the style layer before which data layers are
inserted (default `poi_label`).

## Legacy compatibility redirect

Historically the tileserver was consumed as a *remote service*
(`tileserver-koumoul`, seeded from config, pointing at
`https://koumoul.com/s/tileserver`) through the generic remote-service proxy.
Older deployed map applications (e.g. infos-territoires) still build
`{apiUrl}/remote-services/tileserver-koumoul/proxy/styles/<name>/style.json`
from their stored configurations.

A dedicated route in `api/src/remote-services/router.js` answers
`GET /api/v1/remote-services/tileserver-koumoul/proxy/*` with a **302** to
`{sitePath}/tileserver/*` — the publication site's path prefix (empty on
domain-rooted sites) followed by the tileserver path, query string
preserved, `Cache-Control: public, max-age=3600` — consistent with the UI
resolving `map.style` against the site root. It is registered before the
generic proxy handler, needs no Mongo document, and skips rate limiting. The
`remote-services` documents themselves were deleted by the
`api/upgrade/6.16.1/remove-tileserver-remote-service.ts` upgrade script, and
`init()` no longer supports config entries without an OpenAPI `url`.

**When can the redirect be removed?** Once stored application configurations
no longer produce `/remote-services/tileserver-koumoul/proxy/...` URLs — i.e.
when legacy map applications have been updated to target `/tileserver`
directly and their deployed configs re-saved, or when traffic logs show the
redirect is no longer hit.

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
