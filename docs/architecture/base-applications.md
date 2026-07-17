# Base applications

A **base application** ("base app") is the reusable front-end bundle behind a Data Fair
*application* — a Vue/React/whatever SPA such as a map viewer, a data table, or a dashboard
widget. An *application* configuration (owned by a user/org, referencing datasets) points at a
base app by url; several applications commonly share the same base app.

Historically base apps were hosted wherever their CI happened to publish them (jsDelivr CDN for
npm-published apps, `koumoul.com/apps/...` for others) and data-fair just stored that external
url. Since the 6.16 registry migration, **base apps are npm artefacts stored in the
[registry](https://github.com/data-fair/registry) service**, downloaded on demand and served by
data-fair itself. This document describes that model end to end: the artefact convention, the
sync into the `base-applications` collection, the two public serving tiers, the asset-ref rewrite
rules, the CI publishing workflow, and the 6.17.1 migration/ops runbook.

## 1. The artefact model

A base app is published to the registry as an **npm-format artefact** (a gzipped tarball with a
`package/` prefix, `package.json` at its root) tagged with `category: 'application'`.

The artefact id follows the convention:

```
<packageName>@<major>.<minor>
```

e.g. `@koumoul/sankey@1.5` or `@test/monapp1@0.1` (`api/src/base-applications/operations.ts`,
`parseArtefactId`). Unlike a normal npm package version, **there is exactly one, mutable, artefact
per minor line** — publishing `1.5.3` re-uploads the tarball behind the existing `@1.5` artefact
instead of creating a new one. This is a deliberate granularity choice:

- **Patch releases are auto-rolled**: a bugfix build re-tags the same `<major>.<minor>` artefact.
  Every data-fair instance already pointing at `@1.5` picks it up automatically — no application
  needs to change its configuration, no admin action is required.
- **Minor releases are opt-in**: a new minor line is a new artefact id, so it is a new base app
  entry in the catalog. An application keeps working against its current minor until an admin
  explicitly switches it to the newer one. This is intentional because a minor bump may ship
  reviewed **visual changes** (new layout, new default styling) that an admin should consciously
  adopt rather than have silently rolled out under them.

Patch propagation across the fleet rides on the registry's own conditional-GET protocol, not a
push: `ensureArtefact` (from `@data-fair/lib-node-registry`, wrapped by
`ensureBaseAppDir` in `api/src/base-applications/registry.ts`) is memoized for **30 seconds per
artefact id** (`memoizee`, `maxAge: 30000`). Within that window every process serves whatever it
last extracted; after it expires, the next call issues an `If-Modified-Since` request keyed on the
artefact's `dataUpdatedAt` — a `304` keeps serving the cached extract, a `200` streams and extracts
the new tarball into a fresh, content-addressed directory (`<version>+<epochSeconds>/<buildTuple>/`,
where `buildTuple` is `'js'` for base apps) under `config.registryCacheDir` (defaults to
`<tmpDir>/registry-cache`). So a patch re-upload is visible to every data-fair process within, at
most, that ~30 s window — no restart, no explicit invalidation call.

## 2. `base-applications` as a derived cache

The `base-applications` MongoDB collection (`mongo.baseApplications`, schema in
`api/types/base-app/schema.js`) is **not authoritative data** — it is a queryable, denormalized
cache of what the registry currently holds, rebuilt from artefacts by
`initBaseAppFromArtefact` / `syncRegistryBaseApps` (`api/src/base-applications/service.ts`). Two
kinds of fields land on a document:

- **Registry-authoritative** — copied verbatim from the artefact doc at sync time, the registry
  always wins: `title`, `description` (both localized, `{ fr, en }` resolved to the request
  locale by `localizedRegistryField`), `category` (from the artefact's `group` field),
  `public`, `privateAccess`, `deprecated`, `documentation`.
- **Tarball-derived** — recomputed by extracting and inspecting the artefact content on every
  sync: `meta` (parsed from the `<head>` of the extracted `index.html` — `extractHeadMeta`
  reads `<title>` and `<meta name="...">` tags; for `description` and `keywords` specifically,
  resolves `lang`-tagged variants against the request locale with a `locale → defaultLocale → first`
  fallback; other meta tags take the first occurrence); `applicationName` (fallback chain: explicit
  field → `meta['application-name']`) and `version` (fallback chain: explicit field → `meta.version`
  → parsed from the url); and `datasetsFilters` (derived from `config-schema.json` via
  `deriveDatasetsFilters`, used by the application catalog UI to suggest compatible base apps
  for a given dataset).

Sync happens in two places, both calling `syncRegistryBaseApps()`:

- **At boot** — `init()` in `service.ts` first drops any `deprecated: true` doc that no
  application references (`removeDeprecated`), then syncs; sync failures are reported via
  `internalError('base-app-sync', ...)` and never block startup (`api/src/base-applications/router.ts`
  re-exports `init`, called from `api/src/app.js`) — a "give me a fresh view on boot,
  best-effort" pass.
- **On demand** — `POST /api/v1/base-applications/_sync` (`router.ts`), gated by
  `reqAdminMode`. Used by ops after publishing/patching an artefact directly against the
  registry, and by the test harness (`tests/state-setup.ts`) after `publishMockApps()`.

`listAllRegistryAppArtefacts` paginates the registry's `GET /api/v1/artefacts` with
`format: 'npm', category: 'application'`, a hard page size of 100 (the registry's cap), and
`includeDeprecated: 'true'` so deprecated artefacts still get a `base-applications` doc (marked
`deprecated: true`, subject to the boot-time cleanup above) instead of silently disappearing while
still referenced by an existing application. Each artefact is synced independently — one failure
(`initBaseAppFromArtefact` throwing, e.g. a malformed `config-schema.json`) is caught, reported,
and does not stop the loop (`syncRegistryBaseApps`, `service.ts`).

`syncBaseApp` denormalizes a thin `{ id, url, meta, datasetsFilters }` reference onto every
`applications` document that points at the base app's `url` (`baseApp` for the live configuration,
`baseAppDraft` for `urlDraft`), so the application list/detail views don't need a join.

A GET on `/api/v1/base-applications` restricts non-admin callers to `public: true` or an entry in
`privateAccess` matching the caller (`?privateAccess=user:x,organization:y`, checked against the
caller's identity unless `adminMode`), always excludes `deprecated`, and supports `q` (`$text`
search), `applicationName`, and pagination (`router.ts`, `getQuery`).

## 3. Serving: two public tiers

Base app files are downloaded once per artefact per process (via `ensureBaseAppDir`, §1) into a
local extract directory, then served through **two different public routes** with different
freshness/caching trade-offs. Raw `index.html` is **never served as-is from either tier** — it
still contains the `%APPLICATION%` placeholder that only the proxy fills in.

### 3.1 `/app/:id` — per-application, transformed `index.html`

`api/src/applications/proxy.ts` is what a browser loads when opening a configured application. It
is **permission-gated**: `permissions.can('applications', application, 'readConfig', ...)` or a
matching application key (see [application-keys.md](./application-keys.md)) is required, otherwise
it redirects to `/app/:id/login`.

On success it:

1. Resolves the application's base app (`getProxyBaseAppAndLimits`) and 404s if none is configured
   or if the stored doc has no `artefactId` (a leftover from the pre-registry external-url system
   has nothing left to serve).
2. Calls `ensureBaseAppDir(baseApp.artefactId)` to make sure the extract is present/fresh.
3. Reads `index.html`, replaces `%APPLICATION%` with the JSON-serialized application
   configuration (draft-aware via `?draft=true`), and rewrites relative asset references (§4) to
   point at the shared `/app-assets` mount for the **exact resolved version**.
4. Injects data-fair-managed head/body nodes: the per-app manifest link, a `referrer` meta tag,
   the iframe-redirect helper script (keeps the referer domain visible to embedded apps when
   loaded inside another iframe), the service-worker registration script, optional
   `d-frame`/`v-iframe`/`iframe-resizer` compat scripts (driven by the base app's own
   `df:sync-state`/`df:overflow` meta flags), and the brand embed unless hidden by limits.
5. Serves the transformed document with `cache-control: private, max-age=0, must-revalidate` — it
   embeds the caller's own application configuration and permission-derived content, so it must
   never be cached by a shared cache.

**Non-index paths under `/app/:id/...`** (`extraPath`, anything that isn't `index.html` or the
document root) are served directly off the same extract by `serveBaseAppFile`, with
`cache-control: public, max-age=300`. This is the fallback for **legacy webpack/nuxt bundles**
whose runtime resolves lazily-loaded chunks against the *document* URL rather than the entry
script's URL — i.e. a chunk request that a modern bundler would issue against
`/app-assets/pkg/1.5/1.5.3/chunk.js` instead lands on `/app/:id/chunk.js` for these bundles, and
this route makes that resolve to the right file. It intentionally does *not* get the immutable,
long-TTL treatment of `/app-assets`, since the request carries no per-app owner/permission gate
and its 300 s TTL is enough to absorb bursts without pinning a shared cache to a stale bundle for a
year.

### 3.2 `/app-assets` — shared, public, immutable-when-versioned

`api/src/base-applications/assets-router.ts` serves every other static file of the bundle
(scripts, styles, images, fonts, source maps, …), unauthenticated, shared by every application
configured on the same base app (so a hot dataset-dashboard page and a rarely-visited one both
benefit from the same shared-cache hit). The path shape, parsed by `parseAssetsPath`
(`api/src/base-applications/operations.ts`):

```
/app-assets/<packageNameParts...>/<minor>/(<exactVersion>/)?<filePath>
```

e.g. `/app-assets/@koumoul/sankey/1.5/1.5.3/js/app.js` (versioned) or
`/app-assets/@koumoul/sankey/1.5/icon.png` (unversioned). The version segment is what makes the
two tiers behave differently:

- **With the exact current version** (`parsed.version === version` from `ensureBaseAppDir`):
  `Cache-Control: public, max-age=31536000, immutable`. Safe because the URL is
  content-addressed — a changed file always lives behind a new version segment, so a CDN/browser
  that pins this response for a year is never wrong.
- **Without a version, or with a version that doesn't match the currently-extracted one**:
  `Cache-Control: public, max-age=300`. Covers human-facing `icon.png`/`thumbnail.png` links
  (never versioned) and the **rolling-deploy self-heal** case below — both must stay
  short-lived because the content behind the url can legitimately change.

`index.html` and any path that resolves to it are rejected with 404 — the route only serves files
`parseAssetsPath` yields a non-empty, non-`index.html` `filePath` for.

**Rolling-deploy self-heal.** During a rolling deploy, or simply because the 30 s memoize window
hasn't elapsed on every replica at the same instant, one pod can still be extracting an older
patch while another already serves the newer one. If a request asks for an exact version that
doesn't match what this pod currently has cached, the handler does one forced refresh —
`ensureBaseAppDir.delete(artefactId)` then re-calls `ensureBaseAppDir` — before serving. If that
still doesn't converge (the registry itself hasn't finished propagating), the file is served
anyway (graceful degradation — better a possibly-mismatched asset than a 404), but the
`Cache-Control` header falls back to the short-TTL form (`servedAsRequestedVersion` becomes
`false`), so a shared cache never pins the mismatch for a year.

## 4. Asset-ref rewriting

When the proxy (§3.1) builds the transformed `index.html`, every `src`/`href` attribute in
`<head>` and `<body>` that looks like a **relative** reference (not absolute `http(s)://`, not
protocol-relative `//`, not root-relative `/...`, not `data:`, not a `#anchor`) is rewritten to point
at the versioned `/app-assets` mount:

```
${basePath}/app-assets/${packageName}/${minor}/${version}/${originalRef.replace(/^\.\//, '')}
```

This is why a base app bundle must be built with **document-relative** asset urls (`./js/app.js`,
not `/js/app.js` or an absolute CDN url baked at build time) — see §5. Anything already absolute,
protocol-relative, or root-relative is left untouched (root-relative would break anyway once mounted
under `/app-assets/...`, so a base app must not rely on it).

## 5. Publishing a base app (CI workflow)

A base app's CI publishes its build output to the registry as follows:

1. Build with **relative** asset paths so the html/js/css only ever reference `./...`. For Vite
   this is `base: './'` in the config. This is the one thing that changed for apps moving off the
   CDN: a legacy webpack/nuxt build that resolves lazy chunks against the document url instead of
   the script url still works, but only through the `/app/:id/...` extraPath fallback (§3.1), not
   through the immutable `/app-assets` mount.
2. `npm pack` the `dist/` output, **rebased so `index.html` sits at the package root**
   (`package/index.html`, not `package/dist/index.html`) — the registry/proxy always looks for
   `index.html` directly under the extracted artefact directory.
3. `POST /api/v1/artefacts/npm/<pkg>@<major>.<minor>` with the tarball — this uploads into the
   single mutable artefact for that minor line (creating it on first publish, replacing its
   tarball on every subsequent patch of the same minor). Registry metadata (`title`, `description`,
   `group`, `public`, `documentation`, …) is set independently via
   `PATCH /api/v1/artefacts/<id>` (see `buildMetaPatch` in
   `base-apps-migration-utils.ts` for the field mapping data-fair itself uses when it has to fill
   this in).
4. **Vendor fonts and icon glyphs** rather than referencing external CDNs (Google Fonts,
   jsDelivr `@mdi/font`, …) — see the intranet caveat below.

`tests/support/registry.ts` (`publishMockApps`) is the same flow used by the dev/test harness: it
packs each fixture under `tests/fixtures/base-apps/<name>/` as an npm-shaped tarball and posts it
to `@test/<name>@0.1`, then patches `public`/`title` — a minimal, runnable example of steps 2-3.

## 6. The 6.17.1 migration and its ops runbook

`api/upgrade/6.17.1/01-base-apps-to-registry.ts` (helpers in
`api/src/base-applications/base-apps-migration-utils.ts`) is a one-time upgrade script
(`@data-fair/lib-node/upgrade-scripts`) that moves every pre-existing `base-applications` document
off its legacy external url onto a registry artefact, and rewrites every `applications` document
(live `url` and draft `urlDraft`) that references it to match.

**Deterministic url → artefact mapping** (`mapUrlToArtefact`) recognizes two legacy url shapes and
computes the *same* artefact id independent of which environment runs the script (needed for
federated installs, see below):

- `https://cdn.jsdelivr.net/npm/<npmPackage>@<major.minor[.patch]>/dist/` → `<npmPackage>@<major.minor>`
  (npm-published apps; the regex only matches scoped packages, `@scope/name`)
- `https://(staging-)?koumoul.com/apps/<name>/<major.minor[.patch]>/` → `@koumoul/<name>@<major.minor>`
  (non-npm koumoul.com deployments, re-packaged as `@koumoul/<name>` artefacts)

A url that matches neither (already migrated, or an unrecognized host) is left untouched and, if
it still lacks an `artefactId`, reported as a failure needing manual attention.

For each mapped base app the script, per artefact:

1. **Probes** `GET /api/v1/artefacts/<id>` first (idempotent — the artefact may already exist
   because a federated/mirrored instance received it through mirroring, or because a previous run
   of this same script got partway through).
2. **If missing**, resolves content in priority order:
   - an **ops escape hatch**: a hand-placed tarball at
     `<dataDir>/base-apps-migration/<encodeURIComponent(artefactId)>.tgz` wins over everything
     else (for apps that can't be reliably scraped/re-fetched automatically);
   - otherwise, for npm-hosted apps, **re-downloads the real npm tarball** from
     `registry.npmjs.org` and rebases `dist/` to the package root (`fetchNpmApp`);
   - otherwise, **scrapes the live deployment** (`scrapeApp`): fetches `index.html`, follows every
     self-hosted `src`/`href` it finds plus the always-fetched conventional files
     (`config-schema.json`, `icon.png`, `thumbnail.png`, favicons), and — because legacy
     webpack4/vue-cli/nuxt2 bundles build lazy-chunk urls at runtime from an in-source
     id → hash(/name) map rather than a static reference — additionally parses that runtime
     construction out of the entry JS (`parseWebpackChunkUrls`) to discover chunks no static scan
     would find.
   - Either way, every text asset (`.html/.js/.mjs/.css/.json/.map/.svg/.txt`) has its absolute
     old-url prefix rewritten to a relative one (`rewriteTextAsset`): html/js always to `./`
     (the browser resolves `<script src>`/`<link href>` against the *document* url, not the
     script's own url); css `url(...)` references climb back to the bundle root with the right
     number of `../` (the browser resolves those against the *stylesheet's* own url).
   - The resulting tarball is uploaded via
     `POST /api/v1/artefacts/npm/<artefactId>`, then metadata (`buildMetaPatch`) and, if the
     artefact has none yet, a thumbnail (`fillThumbnailGap`) are filled in from the legacy doc.
3. **If already present**, only fields the artefact doesn't already carry are patched in
   (`buildMetaPatch(baseApp, artefact)`) — the script never clobbers metadata that legitimately
   came from elsewhere (a different, already-migrated environment, or a previous partial run).
4. **Rewrites references**: the legacy `base-applications` doc is updated to the new
   `/app-assets/<packageName>/<minor>/` url, `artefactId`, and a new `id` computed with the exact
   same `slug()` call `initBaseAppFromArtefact` uses at sync time — so the next boot sync doesn't
   create a duplicate/colliding doc. If a doc already exists at that id (the boot sync raced ahead
   of the migration script, or a federated instance already synced it), the legacy doc is dropped
   instead of re-keyed, and only the referencing `applications` documents are rewritten. Every
   `applications` document pointing at the old url (via `url` or `urlDraft`) gets that field and
   its denormalized `baseApp`/`baseAppDraft` reference updated to match.

Failures (network errors, unscrapeable apps, …) are collected per-url, logged through the upgrade
script's `debug`, and reported via `internalError('base-apps-migration', ...)` — they do **not**
abort the script; every other base app still migrates, and the failing ones are left on their
legacy url for manual follow-up.

### Ops runbook

- **Federated/on-prem installs must mirror the base-app artefacts into their own registry
  *before* running this upgrade.** The script only rewrites references and, at best, re-scrapes a
  live deployment or re-fetches from `registry.npmjs.org` — it does not have another way to
  materialize an artefact that a central/mirrored registry doesn't have and that isn't reachable
  from that environment. Running the upgrade against an empty registry falls through to the
  scrape/re-fetch paths, which is a lossy last resort, not a substitute for mirroring.
- **Failures land in error monitoring and in the upgrade log**, not just in the returned exit code
  — check `internalError` output (`base-apps-migration` context) and the upgrade script debug log
  for the itemized `{ url, error }` list, and re-run the script (it's idempotent) after fixing the
  root cause or dropping a tarball into the escape hatch.
- **Escape hatch**: place a correctly-shaped npm tarball at
  `<dataDir>/base-apps-migration/<encodeURIComponent(artefactId)>.tgz` (e.g. for
  `@koumoul/sankey@1.5`, that's `%40koumoul%2Fsankey%401.5.tgz`) to bypass scraping/re-fetching
  entirely for one artefact, then re-run.
- **Intranet caveat**: several legacy apps embed external references — Google Fonts stylesheets,
  jsDelivr-hosted `@mdi/font` icon fonts — that the migration's text-asset rewrite does **not**
  touch (only the app's *own* absolute url prefix is rewritten; third-party CDN urls are left as
  they were). On an intranet-only data-fair instance these external requests will fail or leak
  DNS queries outside the network. There is no automatic fix short of vendoring those fonts
  upstream in the app's own build (§5, "vendor fonts and icon glyphs").
- **Known blind spot**: `buildMetaPatch`'s `public`/`deprecated` fields are only filled in when
  *absent* from the artefact (`missing()` checks `undefined`/`null`, not falsy) — this is
  deliberate so a legitimate upstream `false` isn't clobbered back to whatever the legacy doc had.
  But it means that if a migration run crashes and is retried after a partial artefact-metadata
  PATCH already set `public: false` (or any boolean) upstream, a legacy doc that actually had
  `public: true` will not get corrected on retry — the artefact keeps the first value it received.
  If a migrated app unexpectedly comes up non-public (or `deprecated`) after a crash/retry cycle,
  hand-patch the artefact directly (`PATCH /api/v1/artefacts/<id>`) rather than re-running the
  script.

### Rolling deploy of the migration release

The 6.17.1 release both flips base apps over to the registry-only model and ships the migration
script above, so it rolls out like any other deploy — new pods start alongside old ones and take
over gradually — but with a wider, user-visible transition window than usual.

- **Only the first new pod runs the migration.** `upgradeScripts()` (`@data-fair/lib-node/upgrade-scripts.js`,
  called from `api/src/app.js` for `worker` pods) takes the `upgrade` Mongo lock before running
  pending scripts; every other pod that starts while the lock is held logs "upgrade scripts lock
  is already acquired, skip them" and **starts serving immediately without waiting** for the
  migration to finish. The migration itself can take minutes: it walks every legacy
  `base-applications` doc and, per app, may have to scrape a live deployment or re-fetch an npm
  tarball over the network (§6) — with the ~32 base apps in production, that's up to ~32
  sequential network round-trips before every doc is rewritten.
- **Per-app window**: until an app's `base-applications` doc is rewritten, its behavior differs by
  which code a pod is running:
  - **New pods** 404 on it — `api/src/applications/proxy.ts` and `api/src/app.js` (the `/app`
    proxy) explicitly guard on `baseApp.artefactId`: a doc still on its legacy external url has no
    `artefactId` yet, and the guard returns 404 rather than attempting to serve anything.
  - **Old pods** error on it *after* it flips — once the migration rewrites the doc to the new
    `/app-assets/<packageName>/<minor>/` url, an old pod's legacy proxy (`fetchHTML`) does a raw
    HTTP GET of that url expecting `index.html`, but `/app-assets` (§3.2) rejects any path that
    resolves to `index.html` with 404 — the old proxy has no other way to render the app, so the
    request errors for every user still landed on an old pod.

  So each app individually flips from "old pods work, new pods 404" to "new pods work, old pods
  error" at the instant its doc is rewritten, and the whole window closes once the last new pod's
  migration run finishes and the old pods are fully drained. It is bounded and self-healing — no
  manual intervention needed once the rollout completes — but it is real, user-visible downtime per
  app in the meantime, not just a theoretical race.
- **Shrink the window**: pre-publish artefacts before the deploy so the migration script's slow
  scrape/re-fetch path is skipped entirely — either drop a tarball at
  `<dataDir>/base-apps-migration/<encodeURIComponent(artefactId)>.tgz` for each app (the escape
  hatch, §6) or publish directly to the registry ahead of time. With the artefact already present,
  the script only probes, patches metadata gaps, and rewrites references — seconds instead of
  minutes across the whole fleet. Also prefer an off-peak deploy window, and, for federated/on-prem
  installs, make sure the artefacts have already been mirrored into the local registry *before*
  starting the upgrade (§6, "Ops runbook" above) — that requirement predates this release note and
  still applies.
- **Boot-crash hazard, scrub deployment config first**: `api/config/type/schema.json` is
  `additionalProperties: false` and validated at import, and this release deletes the `applications`,
  `applicationsDirectories`, and `applicationsPrivateMapping` keys from it — a deployment config
  **file** that still sets any of them fails validation and crashes the new pod at startup before it
  can even reach the upgrade step. Separately, `api/src/app.js` now asserts eagerly at boot that
  `config.privateRegistryUrl` and `config.secretKeys.registry` are both set, and crashes immediately
  if either is missing (previously this would only have surfaced lazily on the first app-serving
  request). **Before rolling this release out, scrub `applications`/`applicationsDirectories`/
  `applicationsPrivateMapping` out of every deployment config file and make sure
  `privateRegistryUrl`/`secretKeys.registry` are set.** Stale *environment variables* for the three
  removed keys are harmless and don't need cleaning up first — their `custom-environment-variables.cjs`
  mappings (`APPLICATIONS`, `APPLICATIONS_DIRECTORIES`, `APPLICATIONS_PRIVATE_MAPPING`) were deleted
  in the same change, so those env vars are simply no longer read into config at all.

## 7. Where to look in the code

| Concern                                        | File                                                              |
|-------------------------------------------------|--------------------------------------------------------------------|
| Artefact id parsing, `/app-assets` path parsing | `api/src/base-applications/operations.ts`                          |
| Download/cache of extracted artefacts           | `api/src/base-applications/registry.ts`                            |
| Sync into `base-applications` (boot + `_sync`)   | `api/src/base-applications/service.ts`, `router.ts`                |
| `/app-assets` static serving                     | `api/src/base-applications/assets-router.ts`                       |
| `/app/:id` proxy, transform, extraPath fallback  | `api/src/applications/proxy.ts`                                    |
| Base app schema                                  | `api/types/base-app/schema.js`                                     |
| Registry client library                          | `node_modules/@data-fair/lib-node-registry` (`ensureArtefact`)     |
| 6.17.1 migration script                          | `api/upgrade/6.17.1/01-base-apps-to-registry.ts`                   |
| Migration pure helpers (unit-tested)             | `api/src/base-applications/base-apps-migration-utils.ts`           |
| Dev/test registry publishing                     | `tests/support/registry.ts`, `tests/state-setup.ts`                |
| Dev/test registry container                      | `docker-compose.yaml` (`registry` service)                         |
| Related: proxy permission gate, application keys | [application-keys.md](./application-keys.md)                       |
| Related: cache layers overview                   | [caching.md](./caching.md)                                         |
