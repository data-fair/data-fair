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
| `api/src/misc/utils/notifications.ts` | Canonical entry points: `sendResourceEvent`, `send`, `subscribe`. Owns the `draft-` prefix logic and the dev/test routing. |
| `api/src/misc/utils/topics-catalog.ts` | Single source of truth for subscribable / webhook topic keys; consumed both by the back-office UI and the webhook event allow-list. |
| `api/src/misc/utils/journals.ts` | Append-only journal log; separate concern, see §1. |
| `api/src/misc/utils/webhooks.ts` | Webhook dispatch; separate concern, see §1. |
| `api/src/misc/routers/root.ts:53` | `GET /api/v1/notifications/topics-catalog` — public catalog endpoint. |
| `api/src/misc/routers/test-env.ts` | `/events/buffer`, `/events` (SSE) used by e2e tests. |

## 3. Entry points

### `sendResourceEvent(resourceType, resource, originator, key, options?)`

Highest-level helper, used everywhere except the few topics that don't map to a single resource. Located at `notifications.ts:24`. It:

1. Derives the singular resource type (`'datasets'` → `'dataset'`).
2. Picks a `sender` (defaults to `resource.owner`, can be overridden by `options.sender`).
3. Computes the **i18n keys** as `notifications.<resourceType>.<draftPrefix><i18nKey or key>.{title,body}` (line 31-32).
4. Computes the **topic key** as `data-fair:<singularType>(-draft)?-<key>:<tail>` (line 43). It emits the event **twice** when `resource.slug` differs from `resource.id`: once with `tail = slug` (the topic key subscribed to by portal apps via slug-bearing URLs) and once with `tail = id` (the topic key subscribed to by the back-office UI). Both pushes carry the same `nanoid()` `_id` so the events service deduplicates the stored event and per-recipient notifications (see §12).
5. Decides public vs private visibility via `permissions.isPublic` (line 50).
6. Delegates to `send` (once per topic tail).

Note: `options.i18nKey` only overrides the i18n lookup. The topic key is always derived from `key`. This is what allows the REST vs file wording split without renaming the topic.

### `send(event, sessionState?)`

Lower-level helper for events that don't fit the resource pattern (settings events, change-owner). Located at `notifications.ts:63`. **Always go through `send` or `sendResourceEvent` rather than calling `eventsQueue.pushEvent` directly** — see §6.

### `subscribe(req, subscription)`

Creates a subscription on the events service on behalf of the current user. Used for implicit subscriptions (publication-sites at `settings/router.ts:401-422`). Posts to `<privateEventsUrl>/api/v1/subscriptions` with the request cookie.

## 4. Topic key conventions

Notification topics live under the `data-fair:` namespace on the events service. The canonical patterns are:

| Shape | Example | Where |
|---|---|---|
| Resource event | `data-fair:<resource>-<event>:<slug>` **and** `data-fair:<resource>-<event>:<id>` | `notifications.ts`. Emitted on both topic shapes with a shared event `_id`; the events service deduplicates. See §3 and §12. |
| Draft resource event | `data-fair:<resource>-draft-<event>:<id>` | Same, automatically when `resource.draftReason` is truthy (`notifications.ts:43`). |
| Publication-site event | `data-fair:<resource>-<event>:<siteType>:<siteId>[:<topicId>]` | `publication-sites.ts:57,63,89,102,117,123`. Implicit subscriptions for these topics live at `settings/router.ts:407,415`. |
| Settings event | `data-fair:settings:<event>` | `settings/router.ts:200,240`. |
| User-custom | `data-fair:dataset-user-notification:<slug>:<topic>` | `datasets/router.js:1411`. `<topic>` is free text supplied by the caller (typically a portal). |

See §8 for the topics whose key shape predates these conventions and are kept that way deliberately.

## 5. Catalog and webhook allow-list

`api/src/misc/utils/topics-catalog.ts` is the single source of truth for the topics the back-office UI offers as subscribable or webhook-triggerable. Each entry declares its `audience` (`'subscription'`, `'webhook'`, or `'both'`) and an i18n `title`. Two consumers read it:

- **UI**: `ui/src/pages/notifications.vue` fetches `GET /api/v1/notifications/topics-catalog` (handler at `api/src/misc/routers/root.ts:53`) and builds the dataset / application subscription sections from the entries whose audience is `'subscription'` or `'both'`.
- **Webhook schema**: `api/types/settings/schema.js` lists the webhook event allow-list. It is kept manually aligned with the catalog entries whose audience is `'webhook'` or `'both'`. Until that schema is fully derived from the catalog at build time, both files must be edited together.

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
- **Proactive notification for API key expiration is not implemented yet** — API keys expire silently and the first call after `expireAt` returns `403`. A proactive J-3 / post-expiration notification was prototyped during the refacto but reverted because data-fair has no in-process scheduled-task infrastructure today (no `node-cron` / `cron` usage in `api/src/`). Other Koumoul services (`customers/api/src/limits/worker.ts`, `simple-directory/api/src/users/worker.ts`) use `node-cron` + `@data-fair/lib-node/locks` and are the recommended template when the feature is reintroduced.

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

## 11. Tests

E2e tests that already exercise notifications (run with `npx playwright test <file>`):

- `tests/features/datasets/upload/datasets-features.api.spec.ts` — user-notification, data-updated (file wording), structure-updated, change-owner, delete.
- `tests/features/datasets/upload/datasets-drafts-lifecycle.api.spec.ts` — dataset-created, draft-data-updated, draft-validated.
- `tests/features/datasets/rest/rest-line-notifications.api.spec.ts` — `data-updated` on `deleteLine`, `createOrUpdateLine` (create + update + no-op), `patchLine`, `bulkLines`, `deleteAllLines`.
- `tests/features/applications/publication-sites.api.spec.ts` — publication-requested.
- `tests/features/applications/applications.api.spec.ts` — application-created.
- `tests/features/infra/notifications-catalog.api.spec.ts` — `/notifications/topics-catalog` endpoint shape.

Topics still without dedicated coverage (consider adding tests when touched):

- `dataset-patched-properties`, `dataset-breaking-change`
- `application-patched-properties`, `application-updated`, `application-write-keys`, `application-change-owner`, `application-delete`, `application-error`
- `settings:api-key-created`, `settings:api-key-deleted`

## 12. Dual emission on slug + id (changed 2026-05-18)

The back-office UI subscribes to resource events keyed by `resource.slug` (`ui/src/components/common/event-notifications.vue:47`, `ui/src/components/common/event-webhooks.vue:14`). Portal apps subscribe keyed by `resource.id` — for example the data-fair portal at `portals/portal/app/components/dataset/dataset-notifications.vue:39` subscribes to `data-fair:dataset-data-updated:<id>` and `data-fair:dataset-breaking-change:<id>`. Both shapes coexist because each surface naturally identifies the resource by what it has in hand — the back-office walks the slug-based URL, portal apps and external API consumers reach the dataset via its stable id.

Previously `sendResourceEvent` keyed the emitted topic on `resource.slug || resource.id` (slug only when available), so portal-side subscriptions on the id-based shape never matched. Both surfaces had a half-broken subscription experience.

Since the events service supports event deduplication based on `_id` ([events#4](https://github.com/data-fair/events/commit/5e108008ebdcf1977a74f52b92017c7258d941f7)), `sendResourceEvent` now emits the same event **twice** when `resource.slug` ≠ `resource.id`: once with the slug-based topic key, once with the id-based topic key. Both pushes carry the same `nanoid()` `_id`, so:

- The `events` collection stores a single event (second insert is dropped on the `_id` unique index).
- Subscribers on the slug-based topic receive a notification; subscribers on the id-based topic also receive one. A user subscribed to both surfaces — rare in practice — receives two records (notification `_id`s are independently generated per recipient).
- Webhook deliveries fire once per subscription, regardless of the dual emission.

The dev-mode test buffer (`testEvents.emit` + `capturedNotifications`) captures **both** pushes, so e2e tests must look for either key (or assert that both are present with a matching `_id`). The reference test is `'resource events are emitted on both slug and id topics with a shared _id'` in `datasets-features.api.spec.ts`.

Emission order is id-first then slug — `resource.id` is the canonical, stable identifier so the stored event (the first successful insert wins under the `_id` unique constraint) carries the id-based topic shape. This is irrelevant to subscription matching (which is per-topic) but affects the activity feed's "raw event" display in `/events/...`.

**One topic is intentionally not dual-emitted**: `dataset-user-notification:<slug>:<topic>` (`api/src/datasets/router.js:1480`) is an inbound API designed for portal-side pushes that already supply a slug. It is not a resource lifecycle event and is documented in §8.3.

## 13. Quick map of the relevant files

- `api/src/misc/utils/notifications.ts` — emission entry points and draft-prefix logic.
- `api/src/misc/utils/topics-catalog.ts` — UI/webhook topic catalog.
- `api/src/misc/utils/publication-sites.ts` — publication-site notifications (`published`, `published-topic`, `publication-requested`).
- `api/src/misc/routers/root.ts` — `GET /api/v1/notifications/topics-catalog`.
- `api/src/misc/routers/test-env.ts` — test SSE + buffer.
- `api/src/settings/router.ts` — API key lifecycle events.
- `api/types/settings/schema.js` — webhook event allow-list (kept aligned with the catalog).
- `api/i18n/messages/{fr,en}.json` — i18n titles and bodies under `notifications.<resourceType>.*`.
- `ui/src/pages/notifications.vue` — back-office subscription UI; consumes the catalog endpoint.
