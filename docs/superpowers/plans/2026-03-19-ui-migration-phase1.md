# UI Migration Phase 1: Workspace Rename & Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename embed-ui to ui, update all references, add default layout with navigation, and verify embed pages still work.

**Architecture:** The existing embed-ui Vite SPA becomes the main UI served at `/data-fair/` instead of `/data-fair/embed/`. Existing pages move into a `src/pages/embed/` subdirectory to preserve `/embed/` prefix URLs. A default layout with navigation drawer and app bar is added for non-embed pages. The legacy Nuxt ui is moved to `ui-legacy/` for reference.

**Tech Stack:** Vue 3, Vuetify 4, Vite 6, Vue Router 5 (file-based), @data-fair/lib-vue, @data-fair/lib-vuetify

**Spec:** `docs/superpowers/specs/2026-03-19-ui-migration-design.md`

---

### Task 1: Rename directories

**Files:**
- Rename: `embed-ui/` → `ui/`
- Rename: `ui/` → `ui-legacy/`

- [ ] **Step 1: Move ui to ui-legacy**

```bash
git mv ui ui-legacy
```

- [ ] **Step 2: Move embed-ui to ui**

```bash
git mv embed-ui ui
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename embed-ui to ui, old ui to ui-legacy"
```

---

### Task 2: Update root package.json and config files

**Files:**
- Modify: `package.json` (root)
- Modify: `tsconfig.json`
- Modify: `eslint.config.mjs`
- Modify: `.zellij.kdl`
- Modify: `Dockerfile`
- Modify: `dev/worktree.sh`
- Rename: `tests/features/embed-ui/` → `tests/features/embed/`

- [ ] **Step 1: Update root package.json workspaces**

In `package.json`, change `"embed-ui"` to `"ui"` in the workspaces array (line 77).

- [ ] **Step 2: Update root package.json scripts**

Replace all `embed-ui` references in scripts:
- `lint` (line 13): `npm -w embed-ui run lint` → `npm -w ui run lint`
- `lint-fix` (line 14): `npm -w embed-ui run lint-fix` → `npm -w ui run lint-fix`
- `check-types` (line 32): `npm -w embed-ui run check-types` → `npm -w ui run check-types`
- `quality` (line 33): all `npm -w embed-ui` → `npm -w ui`
- `build` (line 22): already uses `npm --prefix ui` — no change needed
- `dev-ui` (line 19): already uses `npm --prefix ui` — no change needed

- [ ] **Step 3: Update tsconfig.json**

Change `"embed-ui"` to `"ui"` in references (line 19).

- [ ] **Step 4: Update eslint.config.mjs**

In the ignores array (line 5), change `'embed-ui/*'` to `'ui-legacy/*'`. Keep `'ui/*'` as-is — the new ui workspace is linted via its own eslint config through the workspace lint command, not the root eslint.

- [ ] **Step 5: Update .zellij.kdl**

Two changes needed to avoid a naming conflict:
- Rename the `embed-ui` pane (line 19-21) to `ui`:
  - `pane name="embed-ui"` → `pane name="ui"`
  - `args "-ic" "nvm use && npm -w embed-ui run dev"` → `args "-ic" "nvm use && npm -w ui run dev"`
- Remove the old `ui` pane (lines 23-26) that ran `npm run dev-ui` (the old Nuxt dev server is no longer needed)

- [ ] **Step 6: Update Dockerfile**

Replace all `embed-ui` references with `ui` in the Dockerfile:
- Line 71: `ADD embed-ui/package.json embed-ui/package.json` → `ADD ui/package.json ui/package.json`
- Line 97: `FROM installer AS embed-ui-builder` → `FROM installer AS ui-builder`
- Line 102: `ADD /embed-ui embed-ui` → `ADD /ui ui`
- Line 103: `RUN npm -w embed-ui run build` → `RUN npm -w ui run build`
- Line 139: `COPY --from=embed-ui-builder /app/embed-ui/dist embed-ui/dist` → `COPY --from=ui-builder /app/ui/dist ui/dist`

- [ ] **Step 7: Update dev/worktree.sh**

Replace `embed-ui` references:
- Line 40: `echo "npm -w embed-ui run build"` → `echo "npm -w ui run build"`
- Line 41: `npm -w embed-ui run build` → `npm -w ui run build`

- [ ] **Step 8: Rename test directory**

```bash
git mv tests/features/embed-ui tests/features/embed
```

Update test descriptions in the 3 test files to replace `embed-ui` with `embed` in describe strings:
- `tests/features/embed/dataset-table.e2e.spec.ts`: `'embed-ui dataset table page'` → `'embed dataset table page'`
- `tests/features/embed/dev-page.e2e.spec.ts`: `'embed-ui dev page'` → `'embed dev page'`
- `tests/features/embed/settings.e2e.spec.ts`: `'embed-ui settings pages'` → `'embed settings pages'`

- [ ] **Step 9: Update ui/package.json name**

In `ui/package.json`, change `"name": "@data-fair/embed-ui"` to `"name": "@data-fair/ui"`.

- [ ] **Step 10: Reinstall dependencies**

Note: This will regenerate `package-lock.json` with the new workspace name, producing a large diff. This is expected.

```bash
npm install
```

- [ ] **Step 11: Verify lint passes**

```bash
npm run lint
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: update all embed-ui references to ui"
```

---

### Task 3: Move existing pages into embed/ subdirectory

All current pages in `ui/src/pages/` need to move into `ui/src/pages/embed/` so file-based routing produces `/embed/` prefix URLs, preserving external embed URLs.

**Files:**
- Move: `ui/src/pages/*` → `ui/src/pages/embed/`
- Keep: `ui/src/pages/embed/` as the new location

- [ ] **Step 1: Create embed directory and move pages**

```bash
cd ui/src/pages
mkdir -p embed
# Move all existing content into embed/
for item in *; do
  [ "$item" = "embed" ] && continue
  git mv "$item" embed/
done
```

- [ ] **Step 2: Verify file structure**

```bash
ls ui/src/pages/embed/
```

Expected: `dataset/`, `application/`, `settings/`, `admin/`, `remote-services/`, `storage.vue`, `workflow/`, `dev.vue`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move embed pages to src/pages/embed/ subdirectory"
```

---

### Task 4: Update Vite config and base paths

**Files:**
- Modify: `ui/vite.config.ts`
- Modify: `ui/src/main.ts`
- Modify: `ui/index.html`

- [ ] **Step 1: Update vite.config.ts base path**

In `ui/vite.config.ts`:
- Line 17: Change `base: '/data-fair/embed'` to `base: '/data-fair/'`
- Line 77: Change `'{SITE_PATH}/data-fair/embed/' + filename` to `'{SITE_PATH}/data-fair/' + filename`

- [ ] **Step 2: Update main.ts router base**

In `ui/src/main.ts`:
- Line 23: Change `$sitePath + '/data-fair/embed/'` to `$sitePath + '/data-fair/'`

- [ ] **Step 3: Update index.html config path**

In `ui/index.html`:
- Line 15: Change `{SITE_PATH}/data-fair/embed{UI_CONFIG_PATH}` to `{SITE_PATH}/data-fair{UI_CONFIG_PATH}`

- [ ] **Step 4: Verify types check**

```bash
npm -w ui run check-types
```

- [ ] **Step 5: Commit**

```bash
git add ui/vite.config.ts ui/src/main.ts ui/index.html
git commit -m "refactor: update base paths from /data-fair/embed to /data-fair/"
```

---

### Task 5: Update API server mounts

**Files:**
- Modify: `api/src/app.js`
- Modify: `api/src/nuxt.js`

- [ ] **Step 1: Update embed-ui dist path in app.js**

In `api/src/app.js` line 192, change:
```javascript
app.use('/embed', await createSpaMiddleware(resolve(import.meta.dirname, '../../embed-ui/dist'), uiConfig, {
```
to:
```javascript
app.use('/embed', await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
```

Note: The mount path stays `/embed` for now. It will be changed to serve the full SPA at `/` once the default layout and main pages are in place. The embed CSP handling stays as-is.

- [ ] **Step 2: Keep nuxt.js as-is for now**

The Nuxt integration (`api/src/nuxt.js`) stays temporarily. It will be removed in a later task once the default layout and main pages are working. For now it serves as fallback for routes not yet in the new SPA.

- [ ] **Step 3: Commit**

```bash
git add api/src/app.js
git commit -m "refactor: update api server to reference ui/dist instead of embed-ui/dist"
```

---

### Task 6: Add layout system to App.vue

**Files:**
- Modify: `ui/src/App.vue`
- Create: `ui/src/layouts/default-layout.vue` (stub)
- Create: `ui/src/layouts/embed-layout.vue`

- [ ] **Step 1: Create embed layout**

Create `ui/src/layouts/embed-layout.vue` — a minimal wrapper that matches the current App.vue behavior. Layouts use `<slot />` because `App.vue` passes `<RouterView />` as slot content.

```vue
<template>
  <v-main>
    <slot />
  </v-main>
</template>
```

- [ ] **Step 2: Create default layout stub**

Create `ui/src/layouts/default-layout.vue` — placeholder to be filled in Task 7. Uses `<slot />` (not `<RouterView />`) since App.vue provides the router view via the slot:

```vue
<template>
  <v-main>
    <slot />
  </v-main>
</template>

<script lang="ts" setup>
</script>
```

- [ ] **Step 3: Update App.vue with layout switching**

Replace `ui/src/App.vue` content:

```vue
<template>
  <v-app>
    <component :is="layout">
      <template #default>
        <RouterView />
      </template>
    </component>
    <ui-notif />
  </v-app>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import uiNotif from '@data-fair/lib-vuetify/ui-notif.vue'
import DefaultLayout from './layouts/default-layout.vue'
import EmbedLayout from './layouts/embed-layout.vue'

// useSession and useHead are auto-imported via vite.config.ts AutoImport plugin
const session = useSession()
const route = useRoute()

const layout = computed(() => {
  if (route.path.startsWith('/embed/') || route.meta.layout === 'embed') {
    return EmbedLayout
  }
  return DefaultLayout
})

useHead({
  htmlAttrs: () => ({ lang: session.lang.value ?? 'fr' })
})
</script>

<style>
html {
  overflow-y: auto;
}
</style>
```

- [ ] **Step 4: Verify types check**

```bash
npm -w ui run check-types
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/App.vue ui/src/layouts/
git commit -m "feat: add layout switching system (default vs embed)"
```

---

### Task 7: Implement default layout with navigation

**Files:**
- Modify: `ui/src/layouts/default-layout.vue`
- Create: `ui/src/components/layout/layout-navigation-left.vue`
- Create: `ui/src/components/layout/layout-navigation-top.vue`

- [ ] **Step 1: Create navigation top bar**

Create `ui/src/components/layout/layout-navigation-top.vue`:

```vue
<template>
  <v-app-bar
    color="primary"
    density="compact"
  >
    <v-app-bar-nav-icon
      @click="drawer = !drawer"
    />
    <v-app-bar-title class="text-body-1">
      Data Fair
    </v-app-bar-title>
    <v-spacer />
    <df-personal-menu />
  </v-app-bar>
</template>

<script lang="ts" setup>
import DfPersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'

const drawer = defineModel<boolean>('drawer', { required: true })
</script>

<i18n lang="yaml">
fr:
  title: Data Fair
en:
  title: Data Fair
</i18n>
```

- [ ] **Step 2: Create navigation left drawer**

Create `ui/src/components/layout/layout-navigation-left.vue`. This is migrated from `ui-legacy/public/components/layout/layout-navigation-left.vue`, rewritten for Vue 3 / Vuetify 4:

```vue
<template>
  <v-navigation-drawer
    v-model="drawer"
    color="primary"
  >
    <v-list
      density="compact"
      nav
    >
      <v-list-item
        :to="'/'"
        :prepend-icon="mdiMonitorDashboard"
        :title="t('home')"
      />
    </v-list>

    <v-list
      v-for="group of navigationGroups"
      :key="group.key"
      density="compact"
      nav
    >
      <v-divider class="mb-1" />
      <v-list-subheader>{{ group.title }}</v-list-subheader>
      <v-list-item
        v-for="item of group.items"
        :key="item.to || item.href"
        :to="item.to"
        :href="item.href"
        :target="item.href ? '_blank' : undefined"
        :prepend-icon="item.icon"
        :title="item.title"
        :subtitle="item.subtitle"
      />
    </v-list>

    <template #append>
      <div class="pa-2 text-center">
        <span class="text-caption">
          <a
            href="https://data-fair.github.io/4/"
            style="color: inherit; text-decoration: none;"
          >Powered by Data Fair</a>
        </span>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionAuthenticated } from '@data-fair/lib-vue/session.js'
import {
  mdiMonitorDashboard,
  mdiDatabase,
  mdiImageMultiple,
  mdiCog,
  mdiMonitorDashboard as mdiPortals,
  mdiTransitConnection,
  mdiCogTransferOutline,
  mdiHarddisk,
  mdiChartBar,
  mdiClipboardTextClock,
  mdiCloud,
  mdiInformation,
  mdiBriefcase,
  mdiAlert,
  mdiApps,
  mdiAccountSupervisor,
  mdiAccountGroup,
  mdiCardAccountDetails,
  mdiViewDashboardEdit,
  mdiPageNext,
} from '@mdi/js'

const { t } = useI18n()
const drawer = defineModel<boolean>({ required: true })
const session = useSessionAuthenticated()

interface NavItem {
  to?: string
  href?: string
  icon: string
  title: string
  subtitle?: string
}

interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

const navigationGroups = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = []

  // Content group
  const content: NavItem[] = [
    { to: '/datasets', icon: mdiDatabase, title: t('datasets') },
  ]
  if (!$uiConfig.config.disableApplications) {
    content.push({ to: '/applications', icon: mdiImageMultiple, title: t('applications') })
  }
  groups.push({ key: 'content', title: t('group.content'), items: content })

  // Management group
  const management: NavItem[] = []
  const account = session.account.value
  if (account?.type === 'organization') {
    management.push({ to: '/organization', icon: mdiAccountGroup, title: t('org') })
  }
  management.push({ to: '/settings', icon: mdiCog, title: t('params') })
  groups.push({ key: 'management', title: t('group.management'), items: management })

  // Connectors group
  const connect: NavItem[] = []
  if ($uiConfig.config.catalogsIntegration) {
    connect.push({ to: '/catalogs', icon: mdiTransitConnection, title: t('catalogs') })
  }
  if ($uiConfig.config.processingsIntegration) {
    connect.push({ to: '/processings', icon: mdiCogTransferOutline, title: t('processings') })
  }
  if (connect.length) groups.push({ key: 'connect', title: t('group.connect'), items: connect })

  // Monitoring group
  const monitor: NavItem[] = []
  monitor.push({ to: '/storage', icon: mdiHarddisk, title: t('storage') })
  groups.push({ key: 'monitor', title: t('group.monitor'), items: monitor })

  // Admin group
  if (session.state.user?.adminMode) {
    const admin: NavItem[] = [
      { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
      { to: '/remote-services', icon: mdiCloud, title: t('services') },
      { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
      { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
    ]
    if (!$uiConfig.config.disableApplications) {
      admin.push({ to: '/admin/base-apps', icon: mdiApps, title: t('baseApplications') })
    }
    groups.push({ key: 'admin', title: t('group.admin'), items: admin })
  }

  return groups
})
</script>

<i18n lang="yaml">
fr:
  home: Tableau de bord
  datasets: Jeux de données
  applications: Applications
  org: Gestion de l'organisation
  params: Paramètres
  catalogs: Catalogues distants
  processings: Traitements périodiques
  storage: Stockage
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  baseApplications: Modèles d'application
  group:
    content: Contenus
    management: Gestion
    connect: Connecteurs
    monitor: Suivi
    admin: Administration
en:
  home: Dashboard
  datasets: Datasets
  applications: Applications
  org: Manage organization
  params: Parameters
  catalogs: Remote catalogs
  processings: Periodic processings
  storage: Storage
  services: Services
  serviceInfo: Service information
  owners: Owners
  errors: Errors
  baseApplications: Application models
  group:
    content: Contents
    management: Management
    connect: Connectors
    monitor: Monitoring
    admin: Administration
</i18n>
```

Note: This is a simplified initial version. The full navigation logic (permissions checks, extra navigation items, portal integration, subscriptions, etc.) will be refined during Phase 2 as those pages are migrated. The navigation items that link to pages not yet created will naturally show 404 until those pages are added.

- [ ] **Step 3: Wire up default layout**

Update `ui/src/layouts/default-layout.vue`:

```vue
<template>
  <layout-navigation-top v-model:drawer="drawer" />
  <layout-navigation-left v-model="drawer" />
  <v-main>
    <slot />
  </v-main>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'

const { lgAndUp } = useDisplay()
const drawer = ref(lgAndUp.value)
</script>
```

- [ ] **Step 4: Verify types check**

```bash
npm -w ui run check-types
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/layouts/ ui/src/components/layout/
git commit -m "feat: add default layout with navigation drawer and top bar"
```

---

### Task 8: Add placeholder home page

**Files:**
- Create: `ui/src/pages/index.vue`

- [ ] **Step 1: Create home page placeholder**

Create `ui/src/pages/index.vue`:

```vue
<template>
  <v-container>
    <h1 class="text-h4 mb-4">
      {{ t('title') }}
    </h1>
    <v-alert type="info" variant="tonal">
      {{ t('wip') }}
    </v-alert>
  </v-container>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  title: Tableau de bord
  wip: Page en cours de migration.
en:
  title: Dashboard
  wip: Page migration in progress.
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/pages/index.vue
git commit -m "feat: add placeholder home page"
```

---

### Task 9: Update API server to serve new SPA at root

**Files:**
- Modify: `api/src/app.js`
- Modify: `api/src/nuxt.js`

The approach: simplify `nuxt.js` to export only `trackEmbed`, add a main SPA mount at `/` for non-embed routes, keep the existing `/embed` mount for embed-specific CSP. Requests to `/embed/*` are matched by the `/embed` mount first (Express evaluates in order), so the `/` mount only handles non-embed routes.

- [ ] **Step 1: Simplify nuxt.js to just trackEmbed**

Replace `api/src/nuxt.js` content entirely — remove all Nuxt SSR code, keep only the tracking middleware:

```javascript
import mongo from '#mongo'

export const trackEmbed = async (req, res, next) => {
  const urlPath = req.url.replace(/^\//, '')
  const [resourceType, resourceId, embedView] = urlPath.split(/[/?]/)
  if (resourceType === 'dataset' && resourceId) {
    const dataset = await mongo.db.collection('datasets').findOne({ id: resourceId }, { projection: { owner: 1, id: 1, title: 1 } })
    if (dataset) {
      const ownerHeader = { type: dataset.owner.type, id: dataset.owner.id }
      if (dataset.owner.department) ownerHeader.department = dataset.owner.department
      res.setHeader('x-resource', JSON.stringify({ type: 'embed', id: `${resourceType}-${resourceId}-${embedView}`, title: encodeURIComponent(`${dataset.title || dataset.id} / ${embedView}`) }))
      res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openEmbed', track: 'openApplication' }))
      res.setHeader('x-owner', JSON.stringify(ownerHeader))
    }
  }
  next()
}
```

- [ ] **Step 2: Update app.js — add trackEmbed and main SPA mount**

In `api/src/app.js`, make these changes:

a) Before the `/embed` SPA mount, add trackEmbed import and middleware:

```javascript
import { trackEmbed } from './nuxt.js'
// ... before the existing createSpaMiddleware('/embed', ...) call:
app.use('/embed', trackEmbed)
```

b) After the `next-ui` redirect block, add the main SPA mount:

```javascript
// main UI SPA - standard CSP, no embed-specific relaxations
app.use('/', await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
  ignoreSitePath: true,
  csp: { nonce: true },
  privateDirectoryUrl: config.privateDirectoryUrl
}))
```

c) Find the Nuxt integration block (the block containing `import('./nuxt.js')).default()`, `nuxt.trackEmbed`, `nuxt.render`) and replace it with just:

```javascript
app.set('ui-ready', true)
```

- [ ] **Step 3: Verify build works**

```bash
npm -w ui run build
```

- [ ] **Step 4: Commit**

```bash
git add api/src/app.js api/src/nuxt.js
git commit -m "refactor: serve new SPA at root, remove Nuxt SSR integration"
```

---

### Task 10: Verify and test

- [ ] **Step 1: Build the UI**

```bash
npm -w ui run build
```

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Verify no test regressions from the rename.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Manual verification with dev server**

Start the dev server and verify:
- Home page loads at `/data-fair/` with the placeholder
- Navigation drawer works
- Embed pages load at `/data-fair/embed/dataset/{id}/table` etc.

```bash
npm run dev-ui
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during Phase 1 verification"
```
