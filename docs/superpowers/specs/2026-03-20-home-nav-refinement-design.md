# Home Dashboard + Navigation Drawer Refinement — Design Spec

## Goal

Refine the simplified home dashboard and navigation drawer to match legacy feature parity: permission-gated sections, metric cards with SVG illustrations, collapsible nav groups, extra navigation items, and portal integration.

## Context

- Branch: `feat-upgrade-ui`
- Current home page (`ui/src/pages/index.vue`): basic layout with quick-link cards, no permission gating, subscription alert always shown when URL configured
- Current nav drawer (`ui/src/components/layout/layout-navigation-left.vue`): flat subheader groups, no collapsing, no permission logic beyond admin check, no extra items
- Legacy equivalents: `ui-legacy/public/pages/index.vue`, `ui-legacy/public/components/layout/layout-navigation-left.vue`

## Architecture

### Session & Permissions

`useSession()` from `@data-fair/lib-vue/session.js` provides:
- `user`, `account`, `accountRole`, `site` (= legacy `siteInfo`), `login`, `setAdminMode`

Permission computeds (to be created as a shared composable `use-permissions.ts`):
- `canContribDep`: account type is `user`, OR org role is `$uiConfig.adminRole` or `$uiConfig.contribRole`
- `canContrib`: `canContribDep` AND no department on active account
- `canAdminDep`: account type is `user`, OR org role is `$uiConfig.adminRole`
- `canAdmin`: `canAdminDep` AND no department on active account
- `missingSubscription`: fetches `/api/v1/limits/{type}/{id}`, checks `limits.defaults && $uiConfig.subscriptionUrl`

### Site Info

`useSession().site` is the Vue 3 equivalent of legacy `siteInfo`. It provides:
- `main?: boolean` — whether this is the main site (vs. a portal secondary site)
- `owner: AccountKeys` — the portal owner
- `isAccountMain?: boolean`

When `site.value` is null (dev mode, no portal), behavior defaults to main site.

---

## 1. `use-permissions.ts` Composable

**File:** `ui/src/composables/use-permissions.ts`

Accepts session from `useSessionAuthenticated()`. Returns reactive permission computeds.

```ts
export function usePermissions () {
  const { account, accountRole } = useSessionAuthenticated()

  const canContribDep = computed(() => {
    if (!account.value) return false
    if (account.value.type === 'user') return true
    const role = accountRole.value
    return role === $uiConfig.adminRole || role === $uiConfig.contribRole
  })

  const canContrib = computed(() => canContribDep.value && !account.value?.department)

  const canAdminDep = computed(() => {
    if (!account.value) return false
    if (account.value.type === 'user') return true
    return accountRole.value === $uiConfig.adminRole
  })

  const canAdmin = computed(() => canAdminDep.value && !account.value?.department)

  return { canContribDep, canContrib, canAdminDep, canAdmin }
}
```

Also exposes `missingSubscription` via a separate `useLimits` function (or inline in the composable) that fetches `/api/v1/limits/{type}/{id}`:

```ts
const limitsFetch = useFetch<any>(() => {
  if (!account.value) return null
  return `${$apiPath}/limits/${account.value.type}/${account.value.id}`
})

const missingSubscription = computed(() => {
  return !!(limitsFetch.data.value?.defaults && $uiConfig.subscriptionUrl)
})
```

Returns `{ canContribDep, canContrib, canAdminDep, canAdmin, missingSubscription }`.

---

## 2. Navigation Drawer Refinement

**File:** `ui/src/components/layout/layout-navigation-left.vue`

### Structural Changes

Replace flat `v-list` + `v-list-subheader` structure with Vuetify 4 `v-list-group` for collapsible sections:

```vue
<v-list density="compact" nav>
  <!-- Portal home (when site is not main) -->
  <v-list-item v-if="site?.title" href="/" ... />
  <!-- Dashboard -->
  <v-list-item to="/" ... />
</v-list>

<!-- Subscription warning -->
<v-list v-if="missingSubscription && canAdmin && $uiConfig.subscriptionUrl" ...>
  <v-list-item to="/subscription" ... />
</v-list>

<v-list v-if="!missingSubscription" density="compact" nav>
  <template v-for="group of navigationGroups" :key="group.key">
    <v-divider />
    <v-list-group v-if="group.items.length" :value="group.key">
      <template #activator="{ props }">
        <v-list-item v-bind="props" :title="group.title" />
      </template>
      <v-list-item v-for="item of group.items" ... />
    </v-list-group>
  </template>
</v-list>
```

### Auto-expand active group

Track which group contains the current route and set it as `opened` on the `v-list`:

```ts
const route = useRoute()
const openedGroups = computed(() => {
  for (const group of navigationGroups.value) {
    for (const item of group.items) {
      if (item.to && route.path.startsWith(item.to)) return [group.key]
    }
  }
  return ['content'] // default
})
```

Use `v-model:opened="openedGroups"` on the `v-list` (Vuetify 4 supports this).

### Navigation groups computed

Port the full legacy `navigation` computed, gated by permissions:

**Content group:**
- Datasets (always)
- Applications (unless `$uiConfig.disableApplications`)
- Pages, Reuses (if `canAdminDep && $uiConfig.portalsIntegration`)

**Management group:**
- Organization management (org admin, no department)
- Department management (org admin, with department)
- Settings (if `canAdminDep`)
- Portals (if `canAdminDep && $uiConfig.portalsIntegration`)

**Connectors group:**
- Catalogs (if `canAdminDep && $uiConfig.catalogsIntegration`)
- Processings (if `canAdminDep && $uiConfig.processingsIntegration`)

**Monitoring group:**
- Subscription (if `canAdmin && $uiConfig.subscriptionUrl`)
- Storage (if `canContrib`)
- Metrics (if `$uiConfig.metricsIntegration` — note: this doesn't exist in UiConfig currently, handle gracefully)
- Events (if `canAdmin && $uiConfig.eventsIntegration`)

**Help group:**
- API doc (if `canContribDep`)
- Extra doc links from config (need to add `extraDocLinks` to UiConfig)

**Admin group** (if `user.adminMode`):
- Service Info, Remote Services, Owners, Errors, Base Applications
- Accounts Management (external link to simple-directory)
- Catalogs plugins (if `$uiConfig.catalogsIntegration`)
- Processings plugins (if `$uiConfig.processingsIntegration`)
- Extra admin navigation items from `$uiConfig.extraAdminNavigationItems`

### Extra navigation items

Inject `$uiConfig.extraNavigationItems` into their declared groups:
- Filter by `mainOnly` (check `site?.main !== false`)
- Filter by `can` permission: `'contrib'` → `canContrib`, `'admin'` → `canAdmin`, `'contribDep'` → `canContribDep`, `'adminDep'` → `canAdminDep`
- Items with `iframe: true` get `to: '/extra/' + item.id`
- Localized titles: `typeof title === 'object'` → pick `title[locale]`

Same for `$uiConfig.extraAdminNavigationItems` → inject into admin group with `to: '/admin-extra/' + item.id`.

### UiConfig additions

Add to `api/src/ui-config.ts`:
- `extraDocLinks: config.extraDocLinks as { icon?: string, href: string, title: string | Record<string, string> }[]`
- `metricsIntegration: !!config.privateMetricsUrl` (if this config exists, otherwise skip metrics item)

---

## 3. Home Dashboard Refinement

**File:** `ui/src/pages/index.vue`

### New component: `dashboard-svg-link.vue`

**File:** `ui/src/components/dashboard/dashboard-svg-link.vue`

Props: `to: string | object | null`, `svg: string`, `title: string`, `color?: string = 'primary'`

Card with themed SVG and title. When `to` is provided, card is clickable (router-link). Uses `layout-themed-svg` for SVG rendering with theme colors.

```vue
<v-card v-bind="cardProps" variant="outlined">
  <v-card-title class="text-center" :class="{ [`text-${color}`]: !!to }">
    {{ title }}
  </v-card-title>
  <layout-themed-svg
    v-if="svg"
    :source="svg"
    :color="color"
    style="width:100%; padding: 0 34px; margin: -16px 0 -20px;"
  />
</v-card>
```

### New metric components

All in `ui/src/components/dashboard/`:

**`dashboard-datasets-error.vue`**
- Fetches `$apiPath + '/datasets?size=0&shared=false&status=error'`
- Displays count with pluralized label
- Links to `/datasets?status=error` when count > 0
- SVG: `Under Constructions_Two Color.svg`, color: `error` when count > 0, grey otherwise

**`dashboard-datasets-draft.vue`**
- Fetches `$apiPath + '/datasets?size=0&shared=false&draftStatus=...'` (statuses from `shared/statuses.json`)
- Links to `/datasets?draftStatus=...` with facet values
- SVG: `Under Constructions _Two Color.svg` (note space), color: `warning` when count > 0

**`dashboard-datasets-requested-publications.vue`**
- Fetches publication sites for account, then fetches datasets with `requestedPublicationSites` filter
- Links to `/datasets?requestedPublicationSites=...`
- SVG: `Checklist_Two Color.svg`

**`dashboard-applications-requested-publications.vue`**
- Same pattern as datasets but for `/applications`
- SVG: `Checklist_Two Color.svg`

### Home page sections

```
[subscription iframe — if missingSubscription]
[login prompt — if !user]

[account space header — always when logged in]
[role info / collaborative mode message]

[Contribute section — if canContribDep]
  3 cards: Create Dataset, Update Dataset, Share Dataset
  SVGs: Data Arranging, Data maintenance, Share

[Manage Datasets — if canAdminDep]
  3 metric cards: requested publications, errors, drafts

[Manage Applications — if canAdminDep]
  1 metric card: requested publications
```

Fix the subscription alert: replace `v-if="$uiConfig.subscriptionUrl"` with `v-if="missingSubscription"` and optionally show as iframe.

SVG imports use Vite's `?raw` suffix: `import dataSvg from '~/assets/svg/Data Arranging_Two Color.svg?raw'`

### Responsive behavior

SVG cards hide the SVG illustration on `xs` breakpoint (use `useDisplay()` from Vuetify to check `smAndUp`).

---

## 4. E2E Tests

**File:** `tests/features/ui/home-nav.e2e.spec.ts`

### Home dashboard tests

1. **Home shows account space header** — login as `test_user1`, verify heading contains user name
2. **Home shows contribute section for user** — login as `test_user1` (personal account), verify "Contribuez" heading and 3 SVG link cards visible
3. **Contribute card links work** — click "Créer un nouveau jeu de données" card, verify navigation to `/new-dataset`
4. **Home shows manage datasets section** — login as `test_user1`, verify "Gérez les jeux de données" heading visible
5. **Manage section shows metric cards** — verify 3 metric cards visible (requested publications, errors, drafts)
6. **Datasets error metric links to filtered list** — upload a dataset that causes error, verify error card shows count > 0 and links to `/datasets?status=error`
7. **Home hides manage sections for non-admin org user** — login as `test_user8` (role=user in test_org1), switch to org, verify manage sections not visible
8. **Non-authenticated home shows login** — navigate without auth, verify login button visible

### Navigation drawer tests

9. **Nav drawer has collapsible content group** — login as `test_user1`, verify Content group with Datasets + Applications
10. **Nav drawer content group is expanded by default** — verify Datasets link visible without clicking
11. **Nav drawer management group present for org admin** — login as `test_user1`, switch to test_org1, verify Management group with org link
12. **Nav drawer admin group visible for superadmin** — login as `test_superadmin` with admin mode, verify admin group items (Service Info, etc.)
13. **Nav drawer hides admin group for regular user** — login as `test_user1`, verify no admin group
14. **Navigation from drawer works** — click Datasets in nav drawer, verify navigation to `/datasets`
15. **Active route auto-expands group** — navigate to `/storage`, verify Monitoring group is expanded

### Test data setup

- `test_user1`: personal account (canContrib, canAdmin as user type)
- `test_user1` on `test_org1`: admin role → canContribDep, canAdminDep, canContrib, canAdmin
- `test_user8` on `test_org1`: user role → no canContrib, no canAdmin
- `test_user5` on `test_org1`: contrib role → canContribDep, canContrib, no canAdmin
- `test_superadmin`: superadmin with admin mode

Note: switching to org account in e2e tests requires using the personal menu or direct session manipulation. The `goToWithAuth` fixture logs in as the user's personal account. To test org context, the test must switch accounts after login (via personal menu UI or by navigating with org query param if supported).

---

## File Map

| File | Action |
|------|--------|
| `ui/src/composables/use-permissions.ts` | Create |
| `ui/src/components/dashboard/dashboard-svg-link.vue` | Create |
| `ui/src/components/dashboard/dashboard-datasets-error.vue` | Create |
| `ui/src/components/dashboard/dashboard-datasets-draft.vue` | Create |
| `ui/src/components/dashboard/dashboard-datasets-requested-publications.vue` | Create |
| `ui/src/components/dashboard/dashboard-applications-requested-publications.vue` | Create |
| `ui/src/components/layout/layout-navigation-left.vue` | Rewrite |
| `ui/src/pages/index.vue` | Rewrite |
| `api/src/ui-config.ts` | Modify (add extraDocLinks) |
| `tests/features/ui/home-nav.e2e.spec.ts` | Create |

## Dependencies

- `layout-themed-svg.vue` — already exists
- SVG assets — already in `ui/src/assets/svg/`
- `shared/statuses.json` — exists, needed for draft status filter
- `useFetch` — auto-imported composable
- `useDisplay` — from Vuetify 4

## Out of Scope

- Gradient background on nav drawer (cosmetic, can add later)
- `extraDocLinks` items from config (add to UiConfig but don't block on missing config)
- Subscription iframe embed (just show alert with link for now, iframe can be added later)
