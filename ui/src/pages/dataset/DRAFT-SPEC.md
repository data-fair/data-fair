# Dataset Draft Mode Specification

## Overview

File-based datasets can enter a **draft state** when a file is uploaded. There are two fundamentally different draft situations that the UI must handle differently:

1. **Initial draft** (`draftReason.key = 'file-new'`) -- A brand new dataset whose file has never been fully processed. No published version exists.
2. **Update draft** (`draftReason.key = 'file-updated'`) -- An existing finalized dataset where a new file version has been loaded. The published version continues to exist alongside the draft.

## Backend Mechanics

### Draft data model

When a dataset has a draft, `dataset.draft` contains a copy of the draft-specific properties (file, schema, count, etc.). The main dataset properties still hold the published version (if any).

- **Schema**: `api/types/dataset/schema.js:857-895` -- defines the `draft` nested object
- **draftReason**: `{ key: 'file-new' | 'file-updated', message: string, validationMode: string }`

### API draft parameter

When requesting a dataset with `?draft=true`, the middleware merges draft state into the response:

```js
// api/src/datasets/service.js:168-174
if (useDraft && dataset.draft) {
  Object.assign(dataset, dataset.draft)
  if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
  if (!dataset.draft.bbox) delete dataset.bbox
}
delete dataset.draft
```

**Key consequence**: With `?draft=true`, the API returns the draft view (merged). Without it, it returns the published view. The `draftReason` field is always present on both views when a draft exists, allowing the UI to detect draft state.

- **Middleware**: `api/src/datasets/middlewares.js:74-92`
- **Merge logic**: `api/src/datasets/service.js:161-174`

### Draft metadata editing

When `dataset.draftReason` is set, all PATCH operations automatically prefix keys with `draft.`:

```js
// api/src/datasets/service.js:484-490
if (dataset.draftReason) {
  for (const key of Object.keys(patch)) {
    draftPatch['draft.' + key] = patch[key]
  }
}
```

This means the edit-metadata page works transparently in draft mode -- saves go to draft state without affecting the published version.

### Draft data indexing

Only the first **100 lines** of the draft file are indexed (sample for preview). After validation, the full file is processed.

- **Separate ES index**: `{prefix}_draft-{datasetId}` vs `{prefix}-{datasetId}`
- **ES alias logic**: `api/src/datasets/es/commons.js:94-98`

### Draft lifecycle endpoints

| Endpoint | Action | File |
|----------|--------|------|
| `POST /datasets/{id}/draft` | Validate (publish) the draft | `api/src/datasets/router.js:557-572` |
| `DELETE /datasets/{id}/draft` | Cancel (discard) the draft | `api/src/datasets/router.js:575-597` |

### Validate draft flow

`api/src/datasets/service.js:542-626` -- `validateDraft()`:
1. Merges `dataset.draft` into main dataset fields
2. Moves draft files (original, converted, attachments) to main directories
3. Promotes draft ES index to main via alias swap
4. Removes draft directory
5. Triggers breaking-change events if schema changed

### Cancel draft flow

`api/src/datasets/service.js:628-630` -- `cancelDraft()`:
1. Removes draft directory and files
2. Deletes draft ES index
3. Unsets `dataset.draft` in MongoDB
4. Dataset reverts to its published state

---

## The Two Draft Situations

### Situation 1: Initial draft (`file-new`)

**Context**: A new dataset is created via file upload with `?draft=true`. The dataset has never been finalized.

**State**:
- `dataset.draftReason.key === 'file-new'`
- `dataset.status === 'draft'` initially, then progresses through processing to `'finalized'` (within draft)
- `dataset.finalizedAt` is **NOT set** on the published view (never been published)
- `dataset.draft.finalizedAt` may be set once draft processing completes
- With `?draft=true`, the merged view has `finalizedAt` only after draft processing completes

**What makes sense in the UI**:
- Data preview (100-line sample from draft) -- yes, this is the only data
- Schema editing -- yes, configure the schema before first publication
- Metadata editing -- yes, set title, description, license, etc.
- Extensions configuration -- yes
- Permissions / Publication / Sharing -- **NO** (nothing published yet, no data to share)
- Applications -- **NO** (no finalized data for apps to consume)
- Cancel draft -- **NO** (there's no previous version to revert to; the user should delete the dataset instead)
- Validate draft -- **YES** (publishes the dataset for the first time)

**User workflow**: Upload file -> review 100-line sample -> configure schema (add concepts, labels) -> edit metadata -> validate draft -> dataset is published and fully processed.

### Situation 2: Update draft (`file-updated`)

**Context**: An existing finalized dataset receives a new file upload. The published version continues to serve data while the draft is being reviewed.

**State**:
- `dataset.draftReason.key === 'file-updated'`
- `dataset.finalizedAt` **IS set** (the published version exists)
- `dataset.draft.finalizedAt` may be set once draft processing completes
- Published data continues to be served via the main ES index
- Draft data is in a separate ES index with only 100 lines

**What makes sense in the UI**:
- Data preview of draft (100-line sample) -- yes, to verify the new file
- Data preview of published version -- yes, the current data is still live
- Schema comparison (published vs draft) -- useful to see what changed
- Metadata editing -- yes, but edits go to draft state (ready for validation)
- Permissions / Publication / Sharing -- **YES** (the published version is still active and serving data)
- Applications -- **YES** (apps still use the published data)
- Cancel draft -- **YES** (discard new file, revert to current published version)
- Validate draft -- **YES** (replace published version with draft)

**User workflow**: Upload new file -> review 100-line sample of new data -> compare schema changes -> adjust metadata if needed -> validate draft (replaces published data) OR cancel draft (keep current version).

---

## UI Architecture

### Dataset store (`ui/src/composables/dataset-store.ts`)

- `provideDatasetStore(id, draft=true)` -- the `draft` parameter cascades to all API calls
- When `draft=true`, the fetched dataset is the merged draft view
- The store exposes `dataset.draftReason` to detect draft state
- `useLines` composable (`ui/src/composables/dataset-lines.ts:24-56`) passes the draft flag to lines API
- All sub-pages (table, map, etc.) already pass `draft=true` to the store

### Legacy UI approach (`ui-legacy/`)

The legacy UI (`ui-legacy/public/pages/dataset/_id/index.vue:593-619`) used `finalizedAt` as the main discriminator:

| Section | Normal | file-new | file-updated |
|---------|--------|----------|--------------|
| Structure (schema) | visible | **hidden** (no `finalizedAt`) | visible |
| Metadata | visible | visible (via `isMetaOnly` fallback) | visible |
| Data (table, map) | visible | **hidden** (no `finalizedAt`) | visible (shows draft data) |
| Applications | visible | hidden | **hidden** (has `draftReason`) |
| Share (permissions, publication) | visible | hidden | **hidden** (has `draftReason`) |
| Activity (journal) | visible | visible | visible |

**Legacy limitation**: For `file-updated` drafts, the legacy UI hid Share and Applications sections, even though the published version is still active. The new UI should improve on this.

The legacy UI also fetched a `validatedDataset` (published version without draft merge) when in draft mode, to enable schema comparison:

```js
// ui-legacy/public/store/dataset.js:173-178
if (dataset.draftReason) {
  const validatedDataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`)
  commit('setAny', { validatedDataset })
}
```

### Current new UI issues (`ui/src/pages/dataset/[id]/index.vue`)

The new UI's `sections` computed (line 406) has bugs in draft handling:
- Data tabs are only shown when `finalizedAt && !isMetaOnly && !draftReason` (line 413) -- so in BOTH draft situations the data section tabs are empty
- Share section hidden for any `draftReason` (line 427) -- correct for `file-new`, wrong for `file-updated`
- Activity section hidden for any `draftReason` (line 448) -- wrong for both situations
- "Edit metadata" action hidden when `draftReason` (dataset-actions.vue:58) -- wrong, metadata editing works in draft mode

---

## Desired Behavior for the New UI

### Common to both draft situations

- **Draft status banner** (`dataset-status.vue`) -- already works, shows messages and validate/cancel buttons
- **Activity/Journal section** -- should always be visible (shows processing events, errors)
- **Edit metadata action** -- should be enabled (edits go to `dataset.draft.*`)

### file-new (initial draft)

Sections visible:
- **Data**: Show inline 100-line sample table + schema view (the user needs to review the data and configure the schema before first publication)
- **Metadata**: Info + metadata editing
- **Activity**: Journal with processing status

Sections hidden:
- Share (nothing published)
- Applications (nothing published)

Actions:
- Validate draft (publish for the first time)
- Delete dataset (no cancel -- there's no previous version)
- Edit metadata
- Upload new file (replace the draft file)

### file-updated (update draft)

Sections visible:
- **Data**: Draft 100-line sample + schema view (possibly with comparison to published schema)
- **Metadata**: Info + metadata editing (edits target draft)
- **Share**: Permissions, publication sites, integration (these apply to the live published version)
- **Applications**: Apps using the published data
- **Activity**: Journal

Actions:
- Validate draft (replace published version)
- Cancel draft (discard new file, keep published version)
- Edit metadata (targets draft)
- Upload new file (replace draft file)

### Published dataset fetching for comparison

For `file-updated` drafts, the store should also fetch the published version (without `?draft=true`) to enable:
- Schema comparison (what columns changed?)
- Data count comparison (published count vs draft sample count)
- File name/size comparison

This was done in the legacy UI via `validatedDataset` in the Vuex store.

---

## Key File References

### Backend
- `api/src/datasets/service.js:161-174` -- draft merge logic in getDataset
- `api/src/datasets/service.js:484-490` -- draft-aware PATCH logic
- `api/src/datasets/service.js:542-626` -- validateDraft (publish)
- `api/src/datasets/service.js:628-630` -- cancelDraft
- `api/src/datasets/router.js:557-597` -- draft endpoints
- `api/src/datasets/middlewares.js:74-92` -- readDataset middleware
- `api/src/datasets/es/commons.js:94-98` -- ES alias for draft index
- `api/types/dataset/schema.js:857-895` -- draft schema definition

### Frontend (new UI)
- `ui/src/pages/dataset/[id]/index.vue` -- main page with sections logic (line 406)
- `ui/src/pages/dataset/[id]/edit-metadata.vue` -- metadata editor (works in draft)
- `ui/src/pages/dataset/[id]/table.vue` -- table page (works in draft)
- `ui/src/components/dataset/dataset-status.vue` -- draft banner + validate/cancel
- `ui/src/components/dataset/dataset-actions.vue` -- right panel actions
- `ui/src/components/dataset/table/dataset-table.vue` -- table component
- `ui/src/composables/dataset-store.ts` -- store with draft param
- `ui/src/composables/dataset-lines.ts` -- lines query with draft flag
- `ui/src/composables/dataset-watch.ts` -- websocket updates

### Frontend (legacy UI, for reference)
- `ui-legacy/public/pages/dataset/_id/index.vue:593-619` -- legacy sections logic
- `ui-legacy/public/store/dataset.js:173-178` -- validatedDataset fetch for comparison
- `ui-legacy/public/components/dataset/dataset-status.vue` -- legacy draft status
- `ui-legacy/public/components/dataset/dataset-schema.vue` -- schema with draft comparison warnings
