# Datasets & Applications List Pages — Design Spec

## Goal

Replace the simplified datasets and applications list pages (search + sort + pagination grid) with full-featured list pages matching the legacy UI: faceted filtering sidebar, infinite scroll, grid/list view toggle (datasets only).

## Architecture

### Shared composable: `useCatalogList`

Extracted from the portals infinite scroll pattern. Manages:

- `displayedItems: Ref<T[]>` — accumulated results array
- `currentPage: Ref<number>` — current page for API pagination
- `loading: Ref<boolean>` — loading state
- `totalCount: Ref<number>` — total from API response
- `hasMore: Computed<boolean>` — `displayedItems.length < totalCount`
- `loadMore()` — increments page, fetches, pushes results
- `reset()` — called when filters/sort change, resets page to 1 and replaces items
- `facets: Ref<Record<string, FacetValue[]>>` — facet counts from API response

Parameters:
- `fetchUrl: string` — API endpoint (`/datasets` or `/applications`)
- `query: ComputedRef<Record<string, any>>` — reactive query params (includes search, sort, facets, filters, owner, select, size)
- `pageSize: number` — defaults to 20

Uses `useFetch` with manual refresh, same pattern as portals: `v-intersect` on sentinel div triggers `loadMore()`.

### Datasets page (`datasets.vue`)

**Layout:**
- Desktop (`mdAndUp`): sidebar (256px) with `dataset-facets` + main column with search bar, sort, view toggle, card grid/list, infinite scroll sentinel
- Mobile: search bar + sort + filter button (opens facets in a dialog/bottom sheet), cards, infinite scroll

**Toolbar row:**
- `v-text-field` for search (`q` param)
- `v-select` for sort (createdAt, updatedAt, title — asc/desc)
- View toggle buttons (grid/list), persisted to localStorage
- "New dataset" button (link to `/new-dataset`)

**Sort options:**
- `createdAt:-1` / `createdAt:1`
- `updatedAt:-1` / `updatedAt:1`
- `title:1` / `title:-1`

**API params:**
```
select: title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason
facets: status,visibility,topics,publicationSites,requestedPublicationSites,services,concepts,owner,draftStatus
size: 20
page: <currentPage>
sort: <sort>
q: <search>
owner: <currentAccount or facet filter>
status: <facet filter>
draftStatus: <facet filter>
visibility: <facet filter>
topics: <facet filter>
publicationSites: <facet filter>
requestedPublicationSites: <facet filter>
services: <facet filter>
concepts: <facet filter>
```

**Grid mode:** `v-row` with `v-col` (cols=12, sm=6, md=4), each containing `dataset-card`.

**List mode:** `v-list` with `dataset-list-item` entries.

**Infinite scroll:** `<div v-if="hasMore" v-intersect="(isIntersecting: boolean) => isIntersecting && loadMore()" />` after the cards/list, plus a `v-progress-circular` when loading.

**Empty states:** skeleton loaders on initial load, "no dataset" / "no result" messages.

### Applications page (`applications.vue`)

Same layout as datasets but:
- Grid only (no list view toggle, matching legacy)
- Different facets (see below)
- Different API select fields: `title,description,status,updatedAt,publicationSites,topics,visibility,owner,url`
- Different facets request: `status,visibility,topics,publicationSites,requestedPublicationSites,base-application,owner`
- "New application" button links to `/new-application`

### Dataset facets component (`dataset-facets.vue`)

Sidebar component with `v-select` or `v-autocomplete` per facet. Each facet:
- Gets values + counts from the `facets` API response
- Shows count badges next to each option
- Updates URL query params on selection
- Clears on deselection

**Facets:**
1. **Owner** — `v-autocomplete` if >10 owners, `v-select` otherwise. Shows `owner.name` with department if applicable.
2. **Status** — `v-select` with options: finalized, error, draft, indexed, loaded, analyzed, schematized.
3. **Draft status** — `v-select` (waiting, validationNeeded, etc.)
4. **Visibility** — `v-select` (public, private, protected)
5. **Topics** — `v-select` with topic titles and colors
6. **Publication sites** — `v-select` with site titles
7. **Requested publication sites** — `v-select`
8. **Services/extensions** — `v-select`
9. **Concepts** — `v-select`

### Application facets component (`application-facets.vue`)

1. **Owner** — same as datasets
2. **Base application** — `v-select` with application template names
3. **Visibility** — `v-select`
4. **Topics** — `v-select`
5. **Publication sites** — `v-select`
6. **Requested publication sites** — `v-select`

### Dataset card component (`dataset-card.vue`)

Props: `dataset`, `showTopics?: boolean`, `showOwner?: boolean`

Content:
- **Title** with text overflow ellipsis
- **Type badges** (chips): virtual, REST-editable, draft (with draftReason), metadata-only
- **File info**: original file name + human-readable size
- **Record count** (formatted with locale)
- **Topic chips** with custom background colors
- **Owner** name (when `showOwner`)
- **Error indicator** (red icon/text when `status === 'error'`)
- **Updated date** (formatted)

Clicking navigates to `/dataset/<id>`.

### Dataset list item component (`dataset-list-item.vue`)

Props: `dataset`, `showTopics?: boolean`, `showOwner?: boolean`

Compact `v-list-item` layout:
- **Title**: dataset title or id
- **Subtitle**: owner (if shown), type indicators (draft/virtual/REST/metadata-only), file name + size, record count
- **Trailing**: topic chips (if shown), error indicator

Clicking navigates to `/dataset/<id>`.

### Application card component (`application-card.vue`)

Props: `application`, `showTopics?: boolean`, `showOwner?: boolean`

Content:
- **Title** with overflow ellipsis
- **Description** (2-line clamp)
- **Status chip** (running=success, error=error, stopped=warning, configured=info)
- **Topic chips** with colors
- **Owner** name (when `showOwner`)
- **Updated date**

Clicking navigates to `/application/<id>`.

## URL query parameters

All filter state is synced to URL query params for bookmarking/sharing:
- `q` — text search
- `sort` — sort field and direction
- `owner` — owner filter
- `status` — status filter
- `draftStatus` — draft status filter (datasets only)
- `visibility` — visibility filter
- `topics` — topics filter
- `publicationSites` — publication sites filter
- `requestedPublicationSites` — requested publication sites filter
- `services` — services filter (datasets only)
- `concepts` — concepts filter (datasets only)
- `base-application` — base application filter (applications only)

## Files to create

- `ui/src/composables/catalog-list.ts` — shared `useCatalogList` composable
- `ui/src/components/dataset/dataset-card.vue` — dataset card for grid view
- `ui/src/components/dataset/dataset-list-item.vue` — dataset list item for list view
- `ui/src/components/dataset/dataset-facets.vue` — dataset facet filters sidebar
- `ui/src/components/application/application-card.vue` — application card for grid view
- `ui/src/components/application/application-facets.vue` — application facet filters sidebar

## Files to modify

- `ui/src/pages/datasets.vue` — rewrite with sidebar layout, infinite scroll, facets
- `ui/src/pages/applications.vue` — rewrite with sidebar layout, infinite scroll, facets

## Mobile behavior

On `smAndDown`:
- Sidebar is hidden
- Facets are accessible via a filter button that opens a `v-dialog` or `v-bottom-sheet`
- Search + sort remain in toolbar
- Cards go full width (cols=12)
