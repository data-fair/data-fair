# OAuth scopes

A session can carry a `scope` claim: an access token obtained by a non human identity (NHI) through simple-directory's token exchange (`<directoryUrl>/api/auth/nhi-token`, RFC 7523 JWT bearer assertion, no client secret). Scoped tokens are `at+jwt` signed by a separate scoped key set. A session without a `scope` claim is unrestricted (humans, unscoped NHIs, API keys, application keys, readApiKey pseudo sessions) and behaves exactly as before: every scope check is a no-op for it.

Code: `api/src/misc/utils/scopes.ts` (vocabulary, tiers, gate, descriptions), `api/src/misc/utils/permissions.ts` (`list()`, `canDoForOwner()`), `api/src/app.js` (gates and marks, websocket `channelScopes`), `api/contract/scopes-security.ts` (OpenAPI). The lib side (`hasScope`, `scopeCovers`, `assertReqScope`, `markScopeChecked`) is in `@data-fair/lib-express`.

## Vocabulary and tiers

Two families, `datasets` and `applications`, each with `:read`, `:write`, `:admin` and a bare umbrella (`datasets` covers every tier). The vocabulary is served at `GET /api/v1/scopes.json` (simple-directory reads it through `PLATFORM_SCOPES_URL`) and as the `oauth2` scheme of `/api-docs.json`.

Tier of a permission class (`shared/permissions/operations.ts`):

| Tier | Classes |
| --- | --- |
| read | `list`, `read`, `readAdvanced` |
| write | `write`, `manageOwnLines`, `post` (contrib) |
| admin | `admin`, `manageMasterData` |

Any other class (superadmin operations) has no tier and is never granted to a scoped session. A higher tier covers the lower ones, so a tier accepts `F:<tier>`, the higher tiers and `F`. Matching is exact or bare umbrella, never prefix (`acceptedScopes(family, tier)`). `remote-services` has no family.

A scoped session is never `adminMode` (the lib refuses superadmin claims on scoped tokens), so superadmin routes stay refused without extra code. The scopes only ever restrict: a scoped session gets the intersection of what its user may do and what its scopes allow.

## The three enforcement layers

1. Gate at mount (`scopeFamilyGate(family)` in `app.js`): in front of `/api/v1/datasets`, `/api/v1/catalog`, `/api/v1/compat-ods` (datasets) and `/api/v1/applications`, `/app` (applications). A scoped session with no scope of the family gets 403, so on public resources it gets less than anonymous, and it loses the application-key / Referer bypass (fail closed). For an in-family scoped bearer the application-key bypass operations are intersected with the token's tier (a `datasets:read` token on a form app loses `createLine`).
2. Permission core: `list()` and `canDoForOwner()` in `permissions.ts` intersect with the session scopes through `scopeAllowsClass`. This is where the tier is enforced per operation: an org admin holding only `datasets:read` cannot write, delete, change permissions or owner of a dataset, nor create one. `asVisitor` needs the family admin tier.
3. Websocket channels: `channelScopes` in `app.js` maps `datasets/...` and `applications/...` to the family scopes, checked by the lib before `canSubscribe`, which then applies the tier through the usual permission check. Other channels are refused to scoped sessions.

Lib-express refuses a scoped session on any route that neither checked scopes nor was marked: that is what "stays refused" below means (403).

## Applications and the datasets they reference

`GET /api/v1/applications/:id/configuration` (and the deprecated `/config`) checks that the session can read the description of every dataset the configuration references (`refreshConfigDatasetsRefs` with the personal session). An `applications:read` token without any `datasets` scope fails closed there: 403 whenever the configuration references a dataset, with a message naming the missing `datasets:read` scope. The `applications:read` scope description says so: applications referencing datasets also need `datasets:read`.

## Any-scope routes

Routes marked as allowed for any scope (`allowAnyScope` / `markScopeChecked`), because the UIs call them on load and they expose nothing a tier would restrict. The list is exhaustive: a route not listed here and not behind a family gate is refused to a scoped session.

- root reads of `/api/v1` (`misc/routers/root.ts`): `GET /ping`, `/api-docs.json`, `/platform/api-docs.json`, `/agents/skills/:file`, `/scopes.json`, `/vocabulary`, `/projections`, `/configurable-remote-services`, `/configurable-catalogs`;
- the settings member reads, each route listed explicitly: `GET /api/v1/settings/:type/:id/topics`, `/datasets-metadata`, `/agent-chat`, `/publication-sites` (these four also require membership of the account) and `/licenses`. The full settings document `GET /api/v1/settings/:type/:id` is not marked and is refused;
- limits `GET /api/v1/limits/:type/:id` (account members);
- base-applications `GET /api/v1/base-applications`, `/:id/icon` and `/:id/thumbnail`;
- remote-services `GET /api/v1/remote-services` (the list), `GET /api/v1/remote-services-actions`, and the proxy `/api/v1/remote-services/:id/proxy/*` (`GET` only: other methods answer 405). `GET /api/v1/remote-services/:id` is not marked;
- `/app-sw.js`, `/streamsaver/mitm.html` and `/streamsaver/sw.js`, `/embed` on `GET`/`HEAD` (the shell; other methods are not served), and the SPA shell on `GET`/`HEAD`.

## What stays refused

Everything not listed above. In particular settings writes (API keys, and publication sites: their configuration writes, `POST`/`DELETE /api/v1/settings/:type/:id/publication-sites...`, are refused; the member read above is allowed), the full settings read, admin, stats, activity, identities, test-env, `POST /api/v1/_check-api`, and routes of other services' families until they opt in (processings, metrics, catalogs and events are phase 1d).

## Tiers of some dataset operations

The tier follows the permission class, not the HTTP method, so some reads are not read tier:

- `readOwnLines` and `readOwnLine` (the `/own/:owner/lines` routes of datasets with line ownership) are in the `manageOwnLines` class, write tier: a `datasets:read` token cannot read its own lines.
- `getPermissions` (`GET /datasets/:id/permissions`) and `readIntegrity` / `readIntegrityRevisions` are in the `admin` class: a `datasets:read` or `datasets:write` token cannot read the ACL nor the integrity state.

## Fragments

Deleting an application deletes its fragments first (`fragmentsService.deleteFragments`, see [fragments.md](fragments.md)), datasets included: a token with `applications:admin` and no datasets scope therefore deletes the dataset fragments of the application it deletes. This is the fragment design (a fragment has no existence without its parent), not a cross-family grant: the token reaches no other dataset operation.

## Documented exposures

What a scoped session can learn beyond its scopes' operations, accepted as is:

- `?can=<operation>` on the listings (`GET /api/v1/datasets?can=writeData`) filters on what the identity could do by its role: a read tier token learns which resources its identity could act on, though it cannot do it with that token.
- The application proxy (`/app/:id`, applications family) fills the configuration of the application with the descriptions of the datasets it references, checked against the application owner, not the session: an applications-only token sees those descriptions through the proxy, unlike `GET /applications/:id/configuration` (above).

## Known gaps in the UI for scoped sessions

UI calls a scoped session gets 403 on, so the corresponding parts of the UI are empty or show an error:

- the dataset page "applications using this dataset" with a datasets-only token (it lists applications);
- remote-services `GET /api/v1/remote-services/:id`;
- `/api/v1/activity` and `/api/v1/stats`;
- the full settings read `GET /api/v1/settings/:type/:id` (settings pages);
- the events notification bell, and the `user/*` websocket channels (until events and the user channels opt in, phase 1d).

## OpenAPI

`components.securitySchemes.oauth2` (client credentials flow, `tokenUrl` = `<directoryUrl>/api/auth/nhi-token`, scopes from `scopeDescriptions('fr')`) is declared in the root doc and the private dataset doc. `applyOauth2Security` adds `{ oauth2: acceptedScopes(family, tier) }` next to `apiKey` and `sdCookie` on every operation that maps to a permission class, from its `x-permissionClass` (root operations defined inline use a table by `operationId`). Public, superadmin and settings operations have no oauth2 entry. `tests/features/scopes/scopes-openapi.unit.spec.ts` checks that every scope used is declared. The agent-surface snapshots do not include `security` and did not change.

## Testing

- `tests/support/nhi.ts`: `nhiSession(scope?)` exchanges an assertion of the test NHI (key in `tests/resources/nhi/`) and returns `cookieAx`, `bearerAx` and the token; no scope gives an unrestricted session.
- The local simple-directory image that issues scoped tokens: see [testing.md](testing.md#scope-tests-and-the-local-simple-directory-image).
- `tests/features/scopes/`: unit tests of the vocabulary and permissions, API tests of the gates, marks, refusals and websocket channels.
- `npx playwright test tests/features/scopes/ --project api`, and the unit file with `--project unit --no-deps`.
