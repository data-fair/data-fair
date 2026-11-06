# Bin (corbeille)

An organization can enable a **bin** for its datasets and applications: a `DELETE` then shelves
the resource instead of destroying it, and an admin can restore it until the retention expires.
Design spec: `docs/superpowers/specs/2026-11-06-dataset-bin-design.md`. Code: `api/src/bin/`
(`operations.ts` pure helpers, `service.ts` shelve / restore / purge / listing, `router.ts`,
`purge-worker.ts`).

## 1. Settings and the marker

- The bin is configured on the **organization main settings**: `settings.bin = { active,
  retentionDays }` (default 30, no cap). Departments inherit it; a user account never has a bin. `getBinSettings` / `binActiveFor` (`service.ts`) read it.
- A shelved resource carries `shelved: { at, by: { id, name }, cascade?, purging? }` (schema in
  `api/types/dataset/schema.js` and `api/types/application/schema.js`). Absence of the field means
  live. `cascade: true` marks a fragment shelved because its parent was (§4), `purging` is the
  claim of a running purge (§6). The marker is server-managed: the application POST/PUT body schema
  excludes it (400) and `initNewApplication` / `replaceApplication` drop it, the dataset bodies and
  both PATCH schemas never had it.
- Retention is evaluated lazily by `shouldPurge` (`operations.ts`): the bin is off, or
  `shelved.at + retentionDays` is past. Changing the setting applies to the items already shelved.

## 2. The `notShelved` contract

Every shelved resource must read as **missing**. `notShelved` (`{ shelved: { $exists: false } }`,
`api/src/bin/operations.ts`) is spread into the Mongo filter of the dataset / application reads:
by id or slug (`memoizedGetDataset`, `getDataset`, `getApplication`, the proxy and application-key
middlewares), listings, counts, facets, sums, catalog search, `embed.js`, the remote-services
and base-applications routers, activity, notifications, the file manager initialization and the
workers. **Any new read, list or worker query on `datasets` / `applications` must include it.**

Deliberate exceptions, which must see shelved resources:

- `integrity/*` writers and readers (the terminal revision is written at purge) and `identities/*`;
- the purge itself and the bin routes (`onlyShelved`);
- limits and storage accounting: shelved resources **keep counting** in every limit and in
  `updateTotalStorage` until purged;
- fragments `getParent` and `findFragments` (the cascade needs them);
- admin Elasticsearch diagnostics.

**Workers.** `taskFilter` (`api/src/workers/index.ts`) adds `notShelved` to every task except
`binAllowedTasks` (`datasets: ['historize', 'historizeLines']`): the integrity outbox must drain,
or the checker would raise `integrity-check-stale` for a dataset that merely sits in the bin.
Everything else (indexing, finalizing, extensions...) is frozen until restore. In
`integrity/checker.ts`, the nightly check (`runOnce`) keeps running on shelved datasets: it also
renews the object locks of the anchors and line revisions (`maybeRenew` / `maybeRenewLines`), which
must not lapse while the dataset waits in the bin. Both `alertStaleChecks` cursors skip shelved
datasets: a pending relay state of a frozen pipeline cannot drain and must not raise an alarm.

**Virtual datasets.** A parent resolving its children (`datasets/utils/virtual.ts`) skips shelved
children silently, as if absent, but does not detach them: they stay in `virtual.children` so
that a restore brings them back. The parents are set to `status: 'indexed'` (re-finalized) at
shelve and at restore so their schema drops or picks up the child. The schema re-sync of the parents
on a child PATCH (`applyPatch`, `datasets/service.ts`) skips shelved parents, so no catalog update
is pushed for a deleted dataset.

**Remote services.** `syncDataset` (`remote-services/service.ts`) treats a shelved dataset as
having no master data and removes its remote service, whatever the caller (shelving, a partner
withdrawal in `identities/service.ts`, a PATCH racing the DELETE). `restore` passes the documents
without the marker, so the remote service is registered again.

**Caches.** `shelve` and `restore` clear the local memo caches (`memoizedGetDataset`, application
keys). Other nodes may serve a stale copy for the TTL of their memo / freshness probe, about
30 s to 1 min.

## 3. Shelving, restore, 409

- `DELETE /datasets/:id` and `/applications/:id` call `binActiveFor(owner)`; if true,
  `shelveDataset` / `shelveApplication` set the marker, shelve the fragments, run the side effects
  of a disappearance (remote service sync, virtual parents re-finalize, application dataset sync)
  and send the usual `*-delete` notification. The marker write is conditioned on `notShelved`: if it
  modifies nothing (a concurrent DELETE won), the side effects and the notification are skipped.
  Otherwise the deletion is the regular one.
  Application keys stay stored but grant nothing while shelved.
- `restore` unsets the marker on the item and on its `cascade` fragments, re-syncs the same
  things, and sends `data-fair:dataset-restore:<id>` / `data-fair:application-restore:<id>`.
- A shelved resource still holds its id and slug. A create that **explicitly** targets them
  (`PUT /datasets/:id`, application creation with an id) answers **409 `errors.shelvedRef`**
  (`findShelvedRef`): ids are checked across all owners (the insert would crash on the duplicate
  key), slugs per owner (`_uniqueRefs`). An admin must restore or purge first.

## 4. Fragments

See [fragments.md](./fragments.md). Shelving a parent shelves its live fragments (datasets and
applications) with `cascade: true`; a fragment already shelved on its own keeps its own marker.
Restoring the parent restores the `cascade` fragments only. Restoring a fragment shelved on its
own whose parent is shelved answers **409**: restore the parent first. A `cascade` fragment is
not listed in the bin nor addressable by the bin routes (`getBinItem` 404); it is counted in its
parent's `fragments`. Purge removes the parent with its fragments.

## 5. Catalogs exception

At shelving the catalogs service is notified as for a real deletion
(`catalogsPublicationQueue.deletePublication`) and drops its publication records. **They are not
restored.** This is the only thing a restore does not bring back.

## 6. Purge

`purgeItem` reuses the existing delete path: `deleteDatasetAndFragments`, or `deleteFragments` +
`deleteApplication`, with `notify: false` (the deletion was notified at shelving), then
`updateTotalStorage`. It first **claims** the item atomically (`findOneAndUpdate` setting
`shelved.purging` to the current date, on a shelved item with no claim or a stale one), and is a
no-op if the item is gone, restored meanwhile or claimed by a running purge. `restore` unsets the
marker only where no claim exists (and refuses any claim upfront): of a restore and a purge racing,
exactly one wins, and a restore of a claimed item answers **409**. A claimed item is hidden from
`GET /api/v1/bin` and the bin routes answer 409 on it. A failed purge keeps its claim (the item may
be partly deleted, so it stays unrestorable); after `PURGE_CLAIM_STALE_MS` (1 hour,
`operations.ts`) the claim is stale: the item is listed again, `DELETE /api/v1/bin/...` can claim
it, and `purgeOwner` purges it at the next cron run whatever the retention.

Triggers: `DELETE /api/v1/bin/:type/:id` (admin), the hourly cron `binPurgeCron`
(`config.binPurgeCron`, `purge-worker.ts`, guarded by the `bin-purge-task` lock), and the
disabling of the bin (the settings write starts a fire-and-forget purge of the whole bin). `purgeOwner` re-reads
the settings **per item** (`shouldPurge`), so a bin re-enabled while a purge runs keeps what is not
yet expired, and one failing item is logged (`bin-purge-item`) without blocking the others.

## 7. API

- `GET /api/v1/bin`: the bin of the active account (organization root, or one department),
  newest first, `?q=` an escaped regex on title and slug. 404 if the bin is not active, 403 unless
  org or department admin (`canSeeBin`). Items carry `purgeAt` and `fragments`.
- `POST /api/v1/bin/:type/:id/_restore` and `DELETE /api/v1/bin/:type/:id` (`type` is `datasets`
  or `applications`): admin of the item's owner or department. 204.
- `GET /api/v1/settings/:type/:id/bin`: `{ active, retentionDays }`, readable by any member of the
  owner so the UI can adapt its delete wording.
- The `/api/v1/bin` routes have no `allowAnyScope`: a scoped (NHI) session is refused on them, as
  on settings writes. `GET /api/v1/settings/:type/:id/bin` is `allowAnyScope` (member-readable, the
  UIs call it on load).

## 8. UI

- `ui/src/composables/use-bin-settings.ts`: the bin setting of the active organization (`GET
  /settings/:type/:id/bin`), provided by the default layout and refreshed by the settings page
  after a save. It drives the "Corbeille" navigation entry (org and department admins) and the
  delete dialogs wording (dataset and application pages).
- `ui/src/pages/bin.vue`: the listing, restore and permanent delete.
- Settings page, "Fonctionnalités" section (organization root only): the switch and the
  retention; disabling a non-empty bin asks for confirmation with its item count
  (`settings-bin-disable-confirm.vue`).
