# Application keys

This document describes how **application keys** provide an intermediate security tier between
"fully public" and "authenticated" access to a Data Fair application and the datasets it embeds.
A key is a shared secret embedded in a URL: anyone with the URL can open the application *and*
read (or, in narrow cases, write to) the datasets that the application references — without ever
logging in. Anything not referenced by a configured application stays gated by the normal
permission model.

> Why this matters: a frequent use case is "I want to share an interactive visualization, a form,
> or a dashboard with a partner who has no account in our directory". Making the underlying dataset
> public is too coarse (it would expose `/api/v1/datasets/:id/lines` to crawlers); leaving it
> private requires authentication. Application keys let the owner mint a per-application URL that
> grants exactly the operations the application needs.

## 1. Data model

The keys live in their own MongoDB collection, `applications-keys`, one document per application.

```ts
// api/types/index.ts
type ApplicationKey = {
  _id: string,       // = application.id (1:1 with the parent application)
  id: string,        // kept for legacy, equals _id
  title: string,
  keys: { id: string }[]  // each entry is one shared secret (nanoid)
  // owner: { type, id, department? }  -- written by the POST endpoint, see §7
}
```

The collection has a single index on `keys.id` (`api/src/mongo.ts:99`) so a referer-derived key
can be resolved in one query. There is no other state: a key is just an opaque id; the operations
it unlocks are derived at request time from the application's configuration.

The JSON contract for the management endpoint is intentionally minimal:

```js
// api/contract/application-keys.js
{ type: 'array', items: { properties: { id, title } } }
```

## 2. Lifecycle (CRUD)

Two endpoints, both gated by `permissions.middleware('…Keys', 'admin')` on the parent application
(`api/src/applications/router.js:614-642`):

| Endpoint                                | Class | Purpose                                          |
|-----------------------------------------|-------|--------------------------------------------------|
| `GET  /api/v1/applications/:id/keys`    | admin | Return `keys` array (empty by default)           |
| `POST /api/v1/applications/:id/keys`    | admin | Replace the full array; auto-fills `id = nanoid()` for new entries; upserts the doc with `_id = application.id` and `owner = application.owner` |

When the parent application is deleted, its keys document is dropped too
(`api/src/applications/router.js:425`). Identity changes (org → user, department moves, …) propagate
through the standard owner-rewrite logic in `api/src/identities/router.js` which lists
`applications-keys` among the collections to update.

The UI exposes a single-key shortcut in
`ui/src/components/application/application-protected-links.vue`: "Créer un lien protégé" POSTs an
array of length 1 and builds the URL as `${siteUrl}/data-fair/app/${encodeURIComponent(key + ':' + appId)}`.
The same component supports deletion (POSTing `[]`).

## 3. URL shapes carrying a key

Two equivalent encodings are accepted, throughout the codebase:

1. Query parameter — `…/app/<appId>?key=<keyId>`
2. Path prefix — `…/app/<keyId>:<appId>`

The path-prefix form exists because some embedding contexts strip query parameters; the proxy
detects it by splitting `req.params.applicationId` on `:`
(`api/src/applications/proxy.js:42-48`). Both forms are URL-decoded with `decodeURIComponent`
since the `:` makes the segment unsafe for raw use.

The same two encodings apply to dataset embed pages (`/data-fair/embed/dataset/<keyId>:<datasetId>`
or `?key=…`), handled by the dataset-API middleware (see §5).

## 4. Enforcement point 1 — application proxy

`api/src/applications/proxy.js` is what users actually load in their browser when they open
`/data-fair/app/...`. The `setResource` middleware:

1. Looks up the application by id/slug.
2. If a key is present, queries `applications-keys` with an **owner filter** built from the
   application's owner (`api/src/applications/proxy.js:50-72`).
3. Accepts the key in either of two cases:
   - it matches the application directly (`applicationKey._id === application.id`), or
   - it matches a *parent* application whose `configuration.applications` references this app
     (dashboard composition, §6).
4. On success, sets `req.matchingApplicationKey` for downstream handlers.

The proxy handler (`router.all('/:applicationId/*extraPath', ...)`, lines 191-196) is the gate:

```js
if (!permissions.can('applications', req.application, 'readConfig', reqSession(req))
    && !req.matchingApplicationKey) {
  return res.redirect(`${req.publicBaseUrl}/app/${req.params.applicationId}/login`)
}
```

So a valid key short-circuits the redirect to the SSO login page. The key id is then injected
into the application configuration sent to the iframe as `req.application.applicationKey` so the
in-app JS can propagate it to its own API calls (`proxy.js:203`).

## 5. Enforcement point 2 — dataset API middleware

`api/src/misc/utils/application-key.ts` is wired *very* broadly into the dataset router
(`api/src/datasets/router.js` — `applicationKey` appears on every read endpoint, the `/lines`
write endpoint, the `own/:owner/...` line endpoints, and the thumbnail/attachment routes). It
runs *before* `permissions.middleware(...)`, so it can grant a bypass that the permission check
will honor.

The middleware uses the HTTP `Referer` header — i.e. it trusts that the browser will report the
page that issued the request — to identify the calling application:

1. Bail out if there is no referer (`next()` immediately — no bypass is applied).
2. Decide which app/dataset the referer is for, based on the path prefix:
   - `/data-fair/embed/dataset/...` → extract dataset id (or `keyId:datasetId`) and key
   - `/data-fair/app/...` → extract application id (or `keyId:appId`) and key
3. Look up the key in `applications-keys` **with the dataset owner's ownerFilter**.
4. Verify the calling app is allowed to reach this dataset — either the application directly
   references it in `configuration.datasets` (matched by `href` or `id`), or the key belongs to a
   parent dashboard that references the calling app in `configuration.applications`.
5. Compute the bypass:
   ```ts
   req.bypassPermissions = matchingApplicationDataset.applicationKeyPermissions
                        || { classes: ['read'] }
   ```
6. If no session is attached yet, install a **pseudo-session** carrying the flag
   `isApplicationKey: true` (see §8).

`permissions.list(...)` in `api/src/misc/utils/permissions.ts:158-164` translates
`bypassPermissions` into a concrete operation set:

```ts
if (bypassPermissions) {
  for (const cl of bypassPermissions.classes || []) {
    for (const op of operationsClasses[cl] || []) operations.add(op)
  }
  for (const op of bypassPermissions.operations || []) operations.add(op)
  return [...operations]   // owner-role and explicit-permission paths are skipped
}
```

`bypassPermissions` is a hard override — once set, the rest of the permission logic is bypassed.
This is also why the middleware's matching is so conservative: it only attaches a bypass when
all five checks succeed.

## 6. Permission scoping per dataset

Per-dataset permission tuning lives on the application's own configuration:

```jsonc
// api/types/application/.type/index.js — configuration.datasets[i]
{
  "href": "https://.../api/v1/datasets/abc",
  "id": "abc",
  "applicationKeyPermissions": {
    "classes":    ["read"],                       // permission classes (default if absent)
    "operations": ["readSchema", "createLine"]    // explicit operation ids
  }
}
```

Examples covered by `tests/features/auth/api-keys.api.spec.ts`:

- Default (`{ classes: ['read'] }`) — anonymous referer can `GET /lines`, `GET /schema`, …
- `{ operations: ['readSafeSchema', 'createLine'] }` — visualization that lets users submit
  rows without reading existing ones (crowdsourcing form).
- `{ operations: ['createOwnLine', 'readOwnLines', 'readDescription'] }` — combined with
  `rest.lineOwnership: true` on the dataset, gives a logged-in user-of-another-service the
  ability to manage only their own rows through the application URL.

The matching dataset entry is also enriched with base-app `datasetsFilters` defaults/consts
before the bypass is computed (`application-key.ts:143-150`), so the same dataset can be reused
by several apps with different default filters and the right one wins per request.

## 7. Owner scoping — the critical boundary

This is the security invariant that makes the rest defensible: **a key from owner A can never be
used to access a resource owned by owner B**, no matter how the request is crafted.

It is enforced by `ownerFilter`, built from the requested resource (the dataset in the API
middleware, the application in the proxy) and added to every `applications-keys` lookup. The
stored `owner` field on the keys doc is refreshed in three places: on every `POST /keys` upsert,
on the application-owner-transfer endpoint (`PUT /:applicationId/owner`), and through the
identity-rewrite path in `identities/router.js` (renames/merges).

```ts
const ownerFilter = {
  'owner.type': dataset.owner.type,
  'owner.id':   dataset.owner.id,
  'owner.department': dataset.owner.department ? dataset.owner.department : { $exists: false }
}
```

This is why the POST endpoint stores `owner: application.owner` on the document and why the
identity-rewrite collection list includes `applications-keys`. The `fix-application-key-owner`
branch (the current working branch) is the latest iteration of this invariant — keep
`owner` writes consistent with the matching `ownerFilter` reads when touching the management
endpoint.

The `department` clause distinguishes a top-level org owner from a same-org *department* owner —
critical for organizations that use departments as tenant boundaries.

## 8. Pseudo-session & owner-role exclusion

When a key-authenticated request reaches the permission code with no user session, the middleware
installs a *fake* one:

```ts
setReqUser(req,
  { id: applicationKey.id, name: applicationKey.title, email: '', organizations: [] },
  undefined, undefined, undefined,
  { isApplicationKey: true })
```

`isApplicationKey: true` is a one-way flag that:

- `getOwnerRole(...)` (`permissions.ts:97-100`) treats as anonymous — the pseudo-user gets **no**
  owner-derived role, even though the synthesized id might collide with a real account id.
- `matchPermission(...)` (`permissions.ts:120-143`) treats as not matching any user/org permission
  entry, even one with `id: '*'`.

So explicit ACLs on the resource cannot be unlocked by a key — only the `bypassPermissions` route
can. Conversely, if a *real* logged-in user opens the same URL, their session is preserved
(`if (!reqUser(req))` guard, `application-key.ts:154`) and they get the union of their normal
permissions and the bypass.

## 9. Parent applications — dashboards

A dashboard is just an application whose configuration references other applications in
`configuration.applications` and other datasets in `configuration.datasets`. A key on the
*parent* unlocks:

- the parent's HTML (proxy direct match)
- any child app's HTML (proxy parent-match query: `id = key._id`,
  `configuration.applications.id = childAppId`)
- any dataset referenced by either parent or child (dataset middleware parent-match)

This is why every key lookup is followed by a *parent-key check* against the `applications`
collection. The same `ownerFilter` is applied to those follow-up queries.

Embed-page support works the same way: `/data-fair/embed/dataset/<keyId>:<datasetId>` is treated
as a referer from a parent application that has the embedded dataset in its
`configuration.datasets`.

## 10. Anti-spam stack for anonymous writes

When the matched route is a write (anything but `GET`/`HEAD`) — the realistic case is anonymous
"submit a form" into a `lineOwnership` dataset — three additional checks fire **before** the
bypass is applied (`application-key.ts:104-131`):

1. **Same-origin check** (`matchingHost`) — the request **must** carry an `Origin` header and its
   value must equal the `origin` of the configured `publicBaseUrl` (URL-origin compare, not string
   prefix). Cross-origin POSTs *and* POSTs without an `Origin` header are rejected with 405
   `errors.noCrossDomain`. Browsers always send `Origin` on POST, so the missing-Origin path
   targets scripted non-browser clients.
2. **Anonymous-action token** — the client must include an `x-anonymousToken` header carrying a
   JWT minted by `simple-directory`'s `/api/auth/anonymous-action` endpoint. Two failure modes:
   - missing → 401 `errors.requireAnonymousToken`
   - `NotBeforeError` (the token has an `nbf` claim a few seconds in the future) → 429
     `errors.looksLikeSpam`
   The token effectively imposes a "the user spent a few seconds on the page before submitting"
   delay — bots that fetch-and-immediately-submit get blocked.
3. **Per-IP rate limit** — `rateLimiting.consume(req, 'postApplicationKey', tokenId|iat)`. The
   default config (`api/config/default.cjs:159-162`) is `{ duration: 60, nb: 1 }` — *one* anonymous
   write per 60 s per IP, per anonymous-token. The proxy's `upstream-hash-by: $remote_addr`
   setting (see `load-management.md` §2) is what makes this consistent across replicas.

A failing test in `api-keys.api.spec.ts` lines 440-458 walks the full flow: too-young token →
429, wait + new token + cleared rate state → 201, immediate retry → 429.

## 11. Threat model & known limits

- **Referer-based**, not cryptographic. A client that forges the `Referer` header (e.g. a
  scripted HTTP client, not a browser) can use the key to read the datasets it unlocks. The
  intermediate-security promise is "anyone with the URL can read", not "only browsers on the
  intended page can read" — keys must therefore be treated as shared secrets and rotated when
  they leak. The UI's warning text on the protected-links page (`application-protected-links.vue`)
  reflects this.
- **No expiry, no per-key revocation history**. To revoke, the admin POSTs a new array without
  the leaked entry (the UI shortcut deletes the *only* key). There is no audit of which key
  served which request beyond the `df.applications.writeKeys` event emitted on rotation.
- **Anti-spam is intentionally weak**. It targets opportunistic bots; a determined attacker who
  solves the anonymous-token wait + uses many IPs can still post. The mitigation is the narrow
  permission surface — `applicationKeyPermissions` should always be the minimum set of
  `operations` for the use case (e.g. `['createOwnLine']`, not `['write']`), so that a successful
  abuse only writes rows the legitimate UI would also produce.
- **Trust boundary stops at the owner**. Cross-owner access is impossible by construction (§7) —
  this is the load-bearing invariant; regressions to the `ownerFilter` queries or the stored
  `owner` field on the document break the whole tier.

## 12. Where to look in the code

| Concern                                | File                                                 |
|----------------------------------------|------------------------------------------------------|
| Type & collection                      | `api/types/index.ts`, `api/src/mongo.ts`             |
| Contract (JSON schema)                 | `api/contract/application-keys.js`                   |
| Management endpoints + UI              | `api/src/applications/router.js:614-642`, `ui/src/components/application/application-protected-links.vue` |
| Proxy gate (HTML)                      | `api/src/applications/proxy.js:32-80` and `:191-203` |
| Dataset API middleware (data)          | `api/src/misc/utils/application-key.ts`              |
| Permission bypass plumbing             | `api/src/misc/utils/permissions.ts:97-183`           |
| Schema for `applicationKeyPermissions` | `api/types/application/.type/index.js`               |
| Rate-limit config                      | `api/config/default.cjs` (`postApplicationKey`)      |
| Tests covering the full flow          | `tests/features/auth/api-keys.api.spec.ts` (lines 245-499) |
