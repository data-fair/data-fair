# Notifications

Data Fair emits three different kinds of events on resource lifecycle. They look superficially similar but serve different consumers, travel through different infrastructure, and have different retention guarantees. This document focuses on the **notifications** layer — the user-facing topic bus that powers in-app alerts, e-mail digests and external integrations subscribed via the `events` service — and explicitly delimits it from the two adjacent concerns (journals, webhooks).

## 1. Three layers, one event

For most resource changes, Data Fair produces:

```
                +-----------------+
                |  Source event   |  (e.g. PATCH /datasets/:id changed schema)
                +--------+--------+
                         |
       +-----------------+-----------------+----------------------+
       |                 |                 |                      |
       v                 v                 v                      v
  journals.log    sendResourceEvent    webhooks dispatch    test buffer
  (audit + WS)    (notifications)      (external HTTP)     (dev only)
       |                 |                 |
       v                 v                 v
   mongo:journals   events service     POST <user URL>
   ws-emitter       (subscriptions,
                    e-mail, devices)
```

- **Journals** (`api/src/misc/utils/journals.ts`) — append-only audit trail kept in MongoDB and pushed to the back-office over websocket via `@data-fair/lib-node/ws-emitter`. Granular and high-volume; consumed by the dataset detail "journal" tab and the WS-driven progress UI. Not user-subscribable. `journals.log` opportunistically calls `sendResourceEvent` for `error` **and** `validation-error` event types (see `journals.ts:33`); both reach the canonical `dataset-error` topic through the **error umbrella fan-out** in `sendResourceEvent` (see §3 and §13) so a single subscription covers every flavour of failure — hard worker crash, soft validation reject, on a regular dataset, on a draft. `error-retry` is intentionally not bridged (transient, would be noisy). Every other notification is emitted explicitly to keep tight control on the topic surface.
- **Notifications** (`api/src/misc/utils/notifications.ts`) — user-facing alerts. Pushed to the external `events` micro-service via `@data-fair/lib-node/events-queue`, where users (and the data-fair owners themselves) subscribe to topic keys. Delivery channels (in-app device, e-mail, etc.) are owned by the events service. This is the layer this document is about.
- **Webhooks** (`api/src/misc/utils/webhooks.ts`, configured via `api/types/settings/schema.js`) — owner-configured outbound HTTP. Triggered from the same source events but with a separate event allow-list defined on the settings document. Independent retries and observability.

The three layers are deliberately separate: a journal can be very chatty without spamming users, the same payload can drive different external integrations through webhooks, and notifications can be added or removed without re-triggering webhook deliveries.

## 2. Module map

| File | Responsibility |
|---|---|
| `api/src/misc/utils/notifications.ts` | Canonical entry points: `sendResourceEvent`, `send`, `subscribe`, `propagateDataUpdatedToVirtualParents`. Owns the `draft-` prefix logic and the dev/test routing. |
| `api/types/settings/schema.js` | Single source of truth for subscribable / webhook topic keys (`webhooks.items.properties.events.items.oneOf`); each option carries `title` (EN) + `x-i18n-title.fr`. Consumed by VJSF in the settings webhook form and by the back-office subscription UI. |
| `api/src/misc/utils/journals.ts` | Append-only journal log; separate concern, see §1. |
| `api/src/misc/utils/webhooks.ts` | Webhook dispatch; separate concern, see §1. |
| `api/src/misc/routers/test-env.ts` | `/events/buffer`, `/events` (SSE) used by e2e tests. |

## 3. Entry points

### `sendResourceEvent(resourceType, resource, originator, key, options?)`

Highest-level helper, used everywhere except the few topics that don't map to a single resource. Located at `notifications.ts:24`. It:

1. Derives the singular resource type (`'datasets'` → `'dataset'`).
2. Picks a `sender` (defaults to `resource.owner`, can be overridden by `options.sender`).
3. Computes the **i18n keys** as `notifications.<resourceType>.<draftPrefix><i18nKey or key>.{title,body}` (line 31-32).
4. Computes the **topic key** as `data-fair:<singularType>(-draft)?-<key>:<tail>` (line 43). It emits the event **twice** when `resource.slug` differs from `resource.id`: once with `tail = id` (back-office subscriptions) and once with `tail = slug` (portal-side subscriptions, and back-compat with slug-based subs created before the back-office migration). Both pushes carry the same `nanoid()` `_id` so the events service deduplicates the stored event on its `_id` unique index (see §12).
5. Decides public vs private visibility via `permissions.isPublic` (line 50).
6. Delegates to `send` (once per topic tail).

Note: `options.i18nKey` only overrides the i18n lookup. The topic key is always derived from `key`. This is what allows the REST vs file wording split without renaming the topic.

### `send(event, sessionState?)`

Lower-level helper for events that don't fit the resource pattern (settings events, change-owner). Located at `notifications.ts:63`. **Always go through `send` or `sendResourceEvent` rather than calling `eventsQueue.pushEvent` directly** — see §6.

### `subscribe(req, subscription)`

Creates a subscription on the events service on behalf of the current user. Used for implicit subscriptions (publication-sites at `settings/router.ts:401-422`). Posts to `<privateEventsUrl>/api/v1/subscriptions` with the request cookie.

### `propagateDataUpdatedToVirtualParents(childDataset, originator, options?)`

Mirror helper used at the two commit-time `data-updated` emission points (file `validateDraft` in `service.js:587`, REST line ops in `rest.ts:917`). Looks up parent virtual datasets via `mongo.datasets.find({ 'virtual.children': childDataset.id })` (indexed by `virtual.children_1` in `mongo.ts:69`) and re-emits `data-updated` on each parent through `sendResourceEvent`, passing the **same `i18nKey` and `localizedParams` as the child emission** so subscribers on a virtual see a body identical to subscribers on the underlying child — no leakage of child identity or virtual-ness, transparent for portal-side subscribers. See §10.1 for the rationale of where it is wired and why `router.js:559` (file upload entry point) is deliberately skipped.

## 4. Topic key conventions

Notification topics live under the `data-fair:` namespace on the events service. The canonical patterns are:

| Shape | Example | Where |
|---|---|---|
| Resource event | `data-fair:<resource>-<event>:<slug>` **and** `data-fair:<resource>-<event>:<id>` | `notifications.ts`. Emitted on both topic shapes with a shared event `_id`; the events service deduplicates. See §3 and §12. |
| Draft resource event | `data-fair:<resource>-draft-<event>:<id>` | Same, automatically when `resource.draftReason` is truthy (`notifications.ts:43`). |
| Publication-site event | `data-fair:<resource>-<event>:<siteType>:<siteId>[:<topicId>]` | `publication-sites.ts:57,63,89,102,117,123`. Implicit subscriptions for these topics live at `settings/router.ts:407,415`. |
| Settings event | `data-fair:settings:<event>` | `settings/router.ts:200,240`. |
| Resource event with state sub-key | `data-fair:api-key-expiration:<apiKeyId>:expiring` and `:expired` | `api/src/settings/api-keys-expiration-worker.ts`. A single user subscription on the parent `data-fair:api-key-expiration:<apiKeyId>` receives both milestones via the prefix matching at `events/api/src/events/operations.ts:23-25`. |
| User-custom | `data-fair:dataset-user-notification:<slug>:<topic>` | `datasets/router.js:1411`. `<topic>` is free text supplied by the caller (typically a portal). |

See §8 for the topics whose key shape predates these conventions and are kept that way deliberately.

## 5. Catalog and webhook allow-list

There is no separate catalog file. The single source of truth is the webhook events allow-list inside the settings schema, at `api/types/settings/schema.js` under `properties.webhooks.items.properties.events.items.oneOf`. Each option carries:

- `const` — the canonical topic key (without the `data-fair:` prefix and without the trailing `:<id>` scope),
- `title` — English label,
- `x-i18n-title.fr` — French label (VJSF picks the locale-appropriate one when `xI18n: true` is set on the form).

Two consumers read this list directly via the static `import settingsSchema from 'api/types/settings/schema.js'` (no API round-trip):

- **Settings webhook form** — `ui/src/components/settings/settings-webhooks.vue` renders the whole settings schema with VJSF; the `oneOf` becomes a multi-select of event types, automatically translated.
- **Back-office subscription UI** — `ui/src/pages/notifications.vue` (global subscription page) and `ui/src/components/common/event-notifications.vue` (per-resource subscription widget) filter the same `oneOf` by resource prefix (`dataset-*` / `application-*`) and read `x-i18n-title[locale]` for the label. The per-resource widget additionally overrides the label for a handful of keys to switch from the indefinite article ("Un jeu de données…") to the definite article ("Le jeu de données…") since the user is already on the resource page.

To add or remove a subscribable / webhook-triggerable topic, edit the `oneOf` — both UIs pick it up automatically.

## 6. Dev / test mode

`notifications.send` (`notifications.ts:63`) is the canonical entry point and **switches its delivery channel based on environment**:

| Environment | Channel |
|---|---|
| `NODE_ENV=development`, main thread | `testEvents.emit('notification', event)` + push to `capturedNotifications` (in-memory ring buffer) |
| `NODE_ENV=development`, worker thread | `parentPort.postMessage(event)` (forwarded to the main thread which then captures it) |
| production | `eventsQueue.pushEvent(event, sessionState)` |

This routing matters: code that calls `eventsQueue.pushEvent` directly **bypasses the test capture buffer** (`capturedNotifications`) and therefore won't be visible to e2e tests subscribed via `/api/v1/test-env/events`. Always use `notifications.send` or `notifications.sendResourceEvent`.

E2e helpers exposed by `api/src/misc/routers/test-env.ts`:

- `POST /api/v1/test-env/events/start` — returns the current buffer offset.
- `GET /api/v1/test-env/events/buffer?offset=N` — returns captured notifications since `N`.
- `GET /api/v1/test-env/events` — server-sent events stream that re-emits every captured notification live.

## 7. Draft prefix logic

`notifications.ts:30,43` automatically prepends `draft-` to **both the i18n lookup and the topic key** when `resource.draftReason` is truthy:

```
i18nKey = `notifications.${resourceType}.${draftPrefix}${options.i18nKey ?? key}.title`
fullKey = `${singularResourceType}-draft-${key}`
```

Practical rule for callers: pass the **clean** key name. For dataset draft lifecycle events emit `'validated'` / `'cancelled'`, not `'draft-validated'` / `'draft-cancelled'`. Passing the prefixed form on a draft resource used to produce topic keys like `dataset-draft-draft-validated` and matching i18n misses — the bug was fixed in this refacto by sanitising the call sites in `datasets/router.js` and `workers/batch-processor/validate-file.ts`; the i18n keys were renamed from `draft-draft-*` to `draft-*` accordingly.

The same rule applies to `breaking-change`: callers always pass `'breaking-change'`, and the draft prefix is added implicitly when the dataset is in draft.

**Error umbrella fan-out.** Whenever `sendResourceEvent` is called with `key === 'error'` or `key === 'validation-error'`, the helper additionally pushes the same event on the canonical `<resource>-error` topic (e.g. `dataset-error`), reusing the same `_id` so the events service deduplicates the stored event. This mirrors the slug+id dual emission pattern (§12) but along the second axis — "specific topic vs umbrella" instead of "slug vs id". Concretely the four flavours `dataset-error`, `dataset-draft-error`, `dataset-validation-error`, `dataset-draft-validation-error` are all emitted on their own topic key **and** on `dataset-error`. A user only needs to subscribe to `dataset-error` to be notified of any failure; a user who wants finer granularity (e.g. only draft validation failures) can subscribe to one of the specific topic keys.

The umbrella push is skipped when the resolved topic key is already the umbrella (`<resource>-error`) — there's no point pushing twice on the same topic with the same `_id`.

## 8. Topics that deserve uniformisation (deliberately not changed)

These topics have shape inconsistencies that would benefit from uniformisation, but renaming any of them would silently invalidate every existing user subscription. They are documented here so a future migration can pick them up with a coordinated subscription-rewrite plan.

### 8.1 `dataset-dataset-created`, `application-application-created` — doubled resource word

Both keys repeat the resource type. A consistent shape would be `data-fair:dataset-created:<id>` / `data-fair:application-created:<id>`.

- **Why it is this way**: historical. The i18n key `dataset-created` was already used as a journal entry type long before the notification topic was added, and `sendResourceEvent` builds the topic key by sticking the singular resource type in front of `key`. Calling with `'created'` would have collided with the journal naming; calling with `'dataset-created'` was the path of least resistance.
- **Cost of changing**: every existing subscription to "new resource created" stops firing silently. Webhook event allow-lists configured on existing settings documents (`api/types/settings/schema.js:93`, `114`) would also need a value migration.

### 8.2 `settings:api-key-created`, `settings:api-key-deleted` — `settings` scope without owner id

Two settings events use `data-fair:settings:<event>` as their full topic key, with no owner id appended. Every other settings event scopes by id (`data-fair:settings:<event>:<scopeId>`).

- **Why it is this way**: at emission time the `sender` field already targets a single owner, so the topic key felt redundant. But it makes scope-based filtering on the events service awkward — a subscription to `data-fair:settings:api-key-created` matches every owner's emission, and the events service has to fall back to per-recipient filtering at delivery time.
- **Cost of changing**: breaks existing subscriptions. Any future UI exposing api-key event subscriptions would have to use the new scoped key shape.

### 8.3 `dataset-user-notification:<slug>:<topic>` — slug-based, free-form trailing segment

Emitted at `api/src/datasets/router.js:1411`. The dataset is identified by **slug** (not id), and `<topic>` is a free-text segment supplied by the caller — typically a portal pushing arbitrary thematic notifications via the public user-notification API.

- **Why it is this way**: backwards-compat with portal apps that subscribe by slug. The slug travels with the user-notification URL the portal generates, the id does not.
- **Cost of changing**: every external portal that pushes user notifications would have to be migrated, and any user subscribed to `data-fair:dataset-user-notification:<old-slug>:<topic>` would have to re-subscribe.

### 8.4 `dataset-published:<siteType>:<siteId>` vs `dataset-published-topic:<siteType>:<siteId>:<topicId>` — parallel topics, no hierarchy

Two related topics are emitted by `api/src/misc/utils/publication-sites.ts:63,102,123`: a coarse "published on site X" and a finer "published on site X, thematique Y". The events service does **not** do hierarchical topic matching today, so a user subscribed to `dataset-published:<site>` does **not** receive `dataset-published-topic:<site>:<topicId>` events for the same site.

- **Why it is this way**: designed to let portals offer subscription per thematique without flooding subscribers to the broader "published" topic.
- **Cost of changing**: either the events service grows hierarchical-subscription support (the cleaner solution), or the topic shape is renamed in a breaking migration. Either way, the back-office subscription UI would need to surface the relationship.

## 9. Known issues / follow-ups

Discovered during the refacto but intentionally left for a follow-up:

- **`admin: true` on change-owner emission** — `api/src/datasets/router.js:327` calls `notifications.send` with a `sender` that includes `admin: true`. The events service rejects payloads with extra `sender` properties and returns `400`. Either strip the field at emission, or relax the events service contract.
- **`notifications.subscribe()` returns `500`** — implicit subscriptions for publication-sites (`api/src/settings/router.ts:401-422`) silently fail against the events service. Root cause is architectural, not a payload issue: data-fair calls `POST ${privateEventsUrl}/api/v1/subscriptions` from the **backend**, forwarding `req.headers.cookie`. The cookie's JWT was issued for the public domain (e.g. `master.localhost`) and `session.reqAuthenticated` on the events side cannot validate it when reached via the internal URL, so the handler throws and returns 500. The error is wrapped in `.catch(err => internalError('subscribe-push', err))` (`notifications.ts:93`) so it never surfaces to the user. The events `senderSubscribe` schema (`events/api/types/partial/schema.js:28-61`) accepts the payload data-fair sends — it is not a validation problem.

  Reference pattern: `customers` auto-subscribes the ticket creator to comment events from the **frontend** (`customers/ui/src/components/issues/issue-new.vue:74-86`), calling `${window.location.origin}/events/api/subscriptions` so the browser cookie has the correct scope. Any new auto-subscribe in data-fair should follow the same UI-side pattern, or the events service should grow a service-to-service auth path keyed off `config.secretKeys.events`.

## 10. REST line operations (added 2026-05-11)

Until 2026-05-11, `data-updated` was only emitted on file uploads (`api/src/datasets/router.js:535`, `api/src/datasets/service.js:587`). REST line operations were silent — subscribing to `data-fair:dataset-data-updated:<id>` on a REST dataset never fired despite obvious data changes. This was ticket #1288.

The five REST handlers in `api/src/datasets/utils/rest.ts` now emit `data-updated` via the local helper `emitLinesUpdated`:

| Handler | When | Counts passed to the notification |
|---|---|---|
| `deleteLine` | After 204 response | `{ nbDeleted: 1 }` |
| `createOrUpdateLine` | After response (HTTP 200 or 201) | `{ nbCreated: 1 }` (201) or `{ nbModified: 1 }` (200); skipped on 304 |
| `patchLine` | After 200 response | `{ nbModified: 1 }`; skipped if `operation._status === 304` |
| `bulkLines` | After response stream closes | full summary `{ nbCreated, nbModified, nbDeleted }`; replaced by `{ deletedAll: true }` when `?drop=true` succeeded |
| `deleteAllLines` | After 204 response | `{ deletedAll: true }` |

The topic key stays `data-fair:dataset-data-updated:<slug>` (resp. `dataset-draft-data-updated`) so that existing user subscriptions transparently start receiving these events. Only the rendered title/body differs: the new i18n keys `notifications.datasets.data-updated-lines` and `notifications.datasets.draft-data-updated-lines` include a `{{details}}` placeholder that summarises the operation.

**Per-request emission, no debouncing.** Each HTTP request to a line endpoint produces one notification — there is no aggregation across requests. Inline-edit UIs that PATCH a single cell at a time will therefore emit one notification per edit. This is intentional: per-edit feedback matches user expectations, and any caller batching many writes is expected to use `_bulk_lines` (which already produces a single recap). The `bulkLines` handler additionally suppresses its summary emission on a mid-stream stream-level failure (`api/src/datasets/utils/rest.ts` — the `streamErrored` flag): the caller already gets the error in the HTTP response, no point claiming a success that did not happen.

### 10.1 Child → virtual parent propagation

Subscribers on a virtual dataset's `data-updated` topic expect to be notified when the data they see changes — which only happens through child datasets. Every commit-time `data-updated` emission on a child therefore mirrors onto each parent virtual via `propagateDataUpdatedToVirtualParents` (see §3):

| Wired at | Emits on virtual parent? | Why |
|---|---|---|
| `service.js:587` (`validateDraft` file path) | yes | Draft has just been merged into the main collection; virtual now serves the new data. |
| `rest.ts:917` (`emitLinesUpdated`, all five REST handlers) | yes | REST line ops commit immediately; virtual sees the change at the next query. |
| `router.js:559` (file upload entry point) | **no** | The child enters draft (`patch.draftReason = 'file-updated'`) and the upload-time notif is `dataset-draft-data-updated:<child>`. Virtual parents do not query draft data, so propagating here would fire a `dataset-data-updated:<virtual>` while the virtual still serves the OLD data. The propagation at `service.js:587` then fires again with the new data — double notif. Skipping at the upload entry point means the virtual fires exactly once, at the moment new data becomes visible. |

The virtual notif **reuses the same `i18nKey` and `localizedParams` as the child emission**, so its rendered title/body is identical to what a subscriber on the underlying child would see (e.g. `3 lignes créées` for a REST bulk). This keeps the topic surface uniform between regular and virtual datasets — portal-side subscribers cannot tell from the notification alone that the resource is virtual.

Topic key on the virtual parent is the standard `data-fair:dataset-data-updated:<virtual-id>` (and `:<virtual-slug>`, see §12). No new topic shape, no new i18n key.

**One notif per parent.** If multiple virtual datasets reference the same child, each gets its own emission (since `sendResourceEvent` is called per parent inside the helper). Conversely, a single line PATCH that triggers one child notif produces N propagated notifs (one per parent), in line with the rest of the system's per-event semantics.

## 11. Tests

Notification assertions live **inline** alongside the feature that emits them — touching an endpoint's behaviour means touching its notif assertion in the same test. Cross-cutting invariants of the dispatch layer itself go in a dedicated infra file.

Helpers (use these, do not roll your own):

- `tests/support/notifications.ts` — `collectNotifs()` (buffer-based, race-free; preferred over `TestEventClient` for notifs), `expectNotif`, `expectNoNotif`, `expectNotifPair` (for slug+id dual emission).

Inline coverage:

- `tests/features/datasets/rest/rest-datasets-crud.api.spec.ts` — `data-updated` on POST/PUT/PATCH/DELETE lines, no-emit on 304 idempotent PUT, delete-all body wording.
- `tests/features/datasets/rest/rest-datasets-bulk.api.spec.ts` — single summarised emission on `_bulk_lines`.
- `tests/features/datasets/upload/datasets-features.api.spec.ts` — `user-notification`, `structure-updated` (drop + add), `breaking-change`, `change-owner`, `delete`.
- `tests/features/datasets/upload/datasets-drafts-lifecycle.api.spec.ts` — `dataset-created`, `draft-data-updated`, `draft-validated` (with slug+id pairing).
- `tests/features/datasets/upload/file-validation.api.spec.ts` — error umbrella fan-out on file validation failure.
- `tests/features/datasets/virtual/virtual-datasets-features.api.spec.ts` — `breaking-change` on virtual schema PATCH (`isVirtual` gate, see §10.1), `data-updated` propagation from child→virtual on file re-upload, REST single line, REST bulk lines.
- `tests/features/applications/publication-sites.api.spec.ts` — `publication-requested` (org and department scopes).
- `tests/features/applications/applications.api.spec.ts` — `application-created`.
- `tests/features/settings/api-keys-expiration.api.spec.ts` — J-3 / J emission, idempotency across runs, catch-up when J-3 was missed, no-emit for far-future and missing-expireAt keys.

Cross-cutting infra:

- `tests/features/infra/notifications-system.api.spec.ts` — dual slug+id emission with shared `_id` (§12). Worker → main thread forwarding (`api/src/workers/tasks.ts`) and umbrella fan-out (§3/§13) are covered incidentally by the file-validation test.

Topics still without dedicated coverage (consider adding tests when touched):

- `dataset-patched-properties`
- `application-patched-properties`, `application-updated`, `application-write-keys`, `application-change-owner`, `application-delete`, `application-error`
- `settings:api-key-created`, `settings:api-key-deleted`

## 12. Dual emission on slug + id

Both topic shapes are first-class and stay emitted in parallel:

- **`<topic>:<id>`** is what the back-office subscribes to (`ui/src/components/common/event-notifications.vue`, `ui/src/components/common/event-webhooks.vue`). The id is the stable identifier — it never changes when the resource is renamed — so it is the right shape for long-lived back-office subscriptions.
- **`<topic>:<slug>`** is what portal apps subscribe to. Portals build their URLs from the slug (e.g. a data-fair portal exposes `/datasets/<slug>`), and a user subscribing from a portal page naturally ends up keyed by slug. The data-fair-portal at `portals/portal/app/components/dataset/dataset-notifications.vue` is one such example. The slug shape also keeps any pre-existing slug-based subscription record (back-office subs created before this branch) working.

`sendResourceEvent` therefore emits the event **twice** when `resource.slug` ≠ `resource.id`. Both pushes carry the same `nanoid()` `_id`, so the events service deduplicates the stored event on its `_id` unique index ([events#4](https://github.com/data-fair/events/commit/5e108008ebdcf1977a74f52b92017c7258d941f7) — `api/src/events/service.ts` keeps the client-supplied `_id` and catches `MongoBulkWriteError` code 11000 on conflict):

- The `events` collection stores a single event. Emission order is id-first, so the stored event carries the id-based topic shape.
- A back-office subscriber matching the id topic and a portal subscriber matching the slug topic each get their own notification record — these go through the per-subscription notifications path which uses fresh `_id`s, so dedup does not apply there.
- Webhook deliveries fire once per matching webhook subscription, regardless of the dual emission.

The dev-mode test buffer captures **both** pushes verbatim (the shared `_id` is preserved in the `event` object before it reaches the events service), so e2e tests must look for either key or use `expectNotifPair` (`tests/support/notifications.ts`) to assert both with a shared `_id`. The reference test lives in `tests/features/infra/notifications-system.api.spec.ts`.

**One topic is intentionally not dual-emitted**: `dataset-user-notification:<slug>:<topic>` (`api/src/datasets/router.js:1480`) is an inbound API designed for portal-side pushes that already supply a slug. It is not a resource lifecycle event and is documented in §8.3.

## 13. Quick map of the relevant files

- `api/src/misc/utils/notifications.ts` — emission entry points and draft-prefix logic.
- `api/src/misc/utils/publication-sites.ts` — publication-site notifications (`published`, `published-topic`, `publication-requested`).
- `api/src/misc/routers/test-env.ts` — test SSE + buffer.
- `api/src/settings/router.ts` — API key lifecycle events.
- `api/types/settings/schema.js` — single source of truth for the subscribable / webhook topic list (the `oneOf` of `webhooks.items.properties.events.items`).
- `api/i18n/messages/{fr,en}.json` — i18n titles and bodies under `notifications.<resourceType>.*`.
- `ui/src/pages/notifications.vue`, `ui/src/components/common/event-notifications.vue`, `ui/src/components/settings/settings-webhooks.vue` — consumers of the schema `oneOf`.
