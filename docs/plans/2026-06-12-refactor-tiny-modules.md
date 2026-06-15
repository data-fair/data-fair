# Phase 2 (+ partial Phase 3) — tiny modules & remote-services req-context

> Expands the Phase 2 brief (and the req-context-only slice of Phase 3) of the
> [master plan](2026-06-10-code-quality-refactor.md §8.1/§8.2). Follows
> [code-conventions.md](../architecture/code-conventions.md). Executed **direct** (no subagents),
> per the user's choice on 2026-06-12.

**Scope decided with the user:**
- **Phase 2 in full:** `catalog`, `identities`, `activity` → `.ts`, router/service/operations split,
  pure logic unit-tested.
- **Phase 3 — remote-services only, req-context adaptation:** remote-services is complex code slated
  for deprecation. **No large code movement.** Only migrate its ad-hoc `req.*` mutation/reads to the
  symbol accessors, to generalize the accessor practice. `service.ts`/`operations.ts` stay as-is;
  `router.js` stays `.js`. The admin leftover (§8.2) is **out of scope** for now.

---

## Cross-cutting accessors created here (topical homes, with `legacyProp` dual-write)

Catalog (reader+setter) and remote-services (setter) are the first consumers, so per conventions §2
("define each accessor in the phase that migrates its setter or readers") these land now:

| Accessor | Type | Home file |
|---|---|---|
| `setReqResource` / `reqResource` / `reqResourceOptional` | `Resource` (throws) / opt | `misc/utils/permissions.ts` |
| `setReqResourceType` / `reqResourceType` | `ResourceType` (throws) | `misc/utils/permissions.ts` |
| `setReqPublicationSite` / `reqPublicationSite` | `any \| undefined` | `misc/utils/publication-sites.ts` |
| `setReqMainPublicationSite` / `reqMainPublicationSite` | `any \| undefined` | `misc/utils/publication-sites.ts` |
| `setReqRemoteService` / `reqRemoteService` | `RemoteService` (throws) | `remote-services/middlewares.ts` (new) |

`legacyProp` dual-write means `app.js` (publicationSite/mainPublicationSite) and permissions.ts's own
legacy reads (`req.resourceType`/`req.resource`) keep working untouched while only these modules switch
to accessors. `publicBaseUrl` is **not** migrated here — its accessor home is the future app.js phase;
catalog reads it via the typed `Request` field, remote-services keeps its legacy read.

---

## Task 1 — catalog → `.ts`

- `operations.ts`: `buildDcatCatalog(datasets, publicationSite, publicBaseUrl)` — the pure DCAT-JSON
  builder lifted verbatim from `router.js:95-165`. Unit-tested (its first direct coverage).
- `service.ts`: `findCatalogDatasets(publicationSite, sessionState)` (mongo find+project from 65-93),
  `getCatalogApiDocs(publicationSite)` (settings findOne + `catalogApiDocs(...)` from 46-50).
  `findDatasets` already lives in `datasets/service` — catalog keeps calling it directly.
- `router.ts`: thin. Uses `reqPublicationSite`/`reqMainPublicationSite`, `setReqPublicationSite`,
  `setReqResourceType`. `datasetUtils.clean(req, r)` stays in the router (datasets-module coupling,
  Phase 6). `mime` import needs `@ts-ignore`? No — add `import mime from 'mime'` keeps the existing
  TS7016; if it counts, leave it (pre-existing baseline error, not increased).
- Tests: `publication-sites.api.spec.ts` covers `/catalog/datasets` + `/catalog/dcat` (untouched).
  New `tests/features/catalog/catalog-operations.unit.spec.ts` pins `buildDcatCatalog`.

## Task 2 — identities → `.ts`

- `service.ts`: `renameIdentity(identity, departments)` (router 24-83), `deleteIdentity(app, identity)`
  (86-121), `reportIdentity(query)` (124-156). Bodies verbatim.
  - Wart: `deleteIdentity` threads `app` into `datasetsService.deleteDataset(app, dataset)` — a
    datasets-module coupling; passed explicitly until Phase 6 decouples `deleteDataset`.
- `router.ts`: thin — the secret-key guard middleware + param narrowing + service calls.
- Tests: `root.api.spec.ts` covers POST rename + DELETE (untouched). No operations.ts (no pure logic).

## Task 3 — activity → `.ts`

- `operations.ts`: `mergeActivity(datasets, applications, size)` — pure concat/relabel/sort/slice from
  `router.js:21-32`. Unit-tested (activity's **first** test of any kind).
- `service.ts`: `findActivityResources(query, size)` — the two mongo finds (15-20).
- `router.ts`: thin. **Preserves verbatim** the buggy `findUtils.query(req, { status: 'status' })` call
  (see parking lot) — query-building stays router-side (needs `req`). 2 residual tsc errors on that
  line remain (pre-existing baseline, not increased; no suppression added).

## Task 4 — remote-services req-context adaptation (no code movement)

In `router.js` (stays `.js`): new `remote-services/middlewares.ts` hosts
`setReqRemoteService`/`reqRemoteService`. Replace:
- `req.resourceType = 'remote-services'` → `setReqResourceType(req, 'remote-services')` (drops `@ts-ignore`).
- `req.publicationSite` reads → `reqPublicationSite(req)` (drops two `@ts-ignore`s).
- `req.remoteService = req.resource = svc` → `setReqRemoteService(req, svc); setReqResource(req, svc)`.
- `req.remoteService` reads → `reqRemoteService(req)`.
The proxy handler (219-321) and `getAppOwner` are left untouched (deprecation-bound, no value in churn).

---

## Parking lot additions (preserved bit-for-bit; dedicated PR + test later)

- **activity GET 500s on every call:** `activity/router.ts` calls `findUtils.query(req, { status: 'status' })`
  with the obsolete 2-arg shape. Current `find.js query(reqQuery, locale, sessionState, resourceType, fieldsMap, …)`
  receives `fieldsMap === undefined` → `Object.keys(undefined)` throws → 500. No test covers the route
  (it is a documented stub: "TODO: replaced by a true activity concept"). Fix = update the call to the
  current signature, add an api spec. Preserved verbatim by this refactor (2 residual tsc errors on that line).
- **catalog DCAT `modified` is always undefined:** in `catalog/operations.ts buildDcatCatalog` (moved verbatim
  from `catalog/router.js:110`), `modified: datasets.dataUpdatedAt || datasets.updatedAt` references the
  `datasets` **array** instead of the loop variable `dataset`, so `modified` is always `undefined`. Fix =
  `dataset.dataUpdatedAt || dataset.updatedAt`. Preserved verbatim (2 residual tsc errors on that line);
  `/catalog/dcat` is covered by an api spec but does not assert `modified`.

## Definition of done

- API/e2e specs untouched & green; new unit specs for `buildDcatCatalog` + `mergeActivity`.
- `npm run check-types-ratchet` improved; baseline committed.
- No new suppressions; catalog/identities reach 0 (activity keeps 2 pre-existing residual errors).
- Accessors only — no `req` mutation in the converted modules (remote-services migrated as above).
- Mount order untouched (`app.js` unchanged).
</content>
</invoke>
