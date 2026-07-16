# Map base layer & tileserver

## Where the base map comes from

Dataset maps (UI map components under `ui/src/components/dataset/map/`)
render a MapLibre base layer whose style URL comes from the `map.style`
config key (`api/config/default.cjs`), shipped to the SPA through
`ui-config.ts` as `$uiConfig.map`.

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
the root-relative `/tileserver/*` (query string preserved,
`Cache-Control: public, max-age=3600`). It is registered before the generic
proxy handler, needs no Mongo document, and skips rate limiting. The
`remote-services` documents themselves were deleted by the
`upgrade/6.16.1/remove-tileserver-remote-service.ts` upgrade script, and
`init()` no longer supports config entries without an OpenAPI `url`.

**When can the redirect be removed?** Once stored application configurations
no longer produce `/remote-services/tileserver-koumoul/proxy/...` URLs — i.e.
when legacy map applications have been updated to target `/tileserver`
directly and their deployed configs re-saved, or when traffic logs show the
redirect is no longer hit.
