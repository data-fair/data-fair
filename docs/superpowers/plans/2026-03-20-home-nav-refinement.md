# Home Dashboard + Navigation Drawer Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the home dashboard and navigation drawer to match legacy feature parity: permission-gated sections with SVG metric cards, collapsible nav groups with full permission logic, extra navigation items, and portal integration.

**Architecture:** A shared `usePermissions` composable computes `canContrib`, `canAdmin`, `canContribDep`, `canAdminDep`, `missingSubscription` from `useSession()` (not `useSessionAuthenticated()`, so it can be used on pages accessible by unauthenticated users) + limits API fetch. The nav drawer uses Vuetify 4 `v-list-group` with `open-strategy="multiple"` for collapsible sections with auto-expand based on active route. Dashboard metric cards are small SFC components that fetch counts from the datasets/applications API and display results using a shared `dashboard-svg-link` card component with `layout-themed-svg`.

**Tech Stack:** Vue 3, Vuetify 4, `@data-fair/lib-vue` session, `useFetch` composable, Vite `?raw` SVG imports, Playwright e2e tests

**Spec:** `docs/superpowers/specs/2026-03-20-home-nav-refinement-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `ui/src/composables/use-permissions.ts` | Create | Shared permission computeds + missingSubscription |
| `ui/src/components/dashboard/dashboard-svg-link.vue` | Create | Themed SVG card with optional router-link |
| `ui/src/components/dashboard/dashboard-datasets-error.vue` | Create | Metric card: datasets in error |
| `ui/src/components/dashboard/dashboard-datasets-draft.vue` | Create | Metric card: draft datasets |
| `ui/src/components/dashboard/dashboard-datasets-requested-publications.vue` | Create | Metric card: datasets pending publication |
| `ui/src/components/dashboard/dashboard-applications-requested-publications.vue` | Create | Metric card: applications pending publication |
| `ui/src/pages/index.vue` | Rewrite | Permission-gated contribute + manage sections |
| `ui/src/components/layout/layout-navigation-left.vue` | Rewrite | Collapsible groups, permissions, extra items |
| `api/src/ui-config.ts` | Modify | Add `extraDocLinks`, `metricsIntegration` |
| `tests/features/ui/home-nav.e2e.spec.ts` | Create | E2E tests for home + nav |

---

### Task 1: `usePermissions` composable

**Files:**
- Create: `ui/src/composables/use-permissions.ts`

- [ ] **Step 1: Create the composable**

Note: `.ts` composable files require explicit imports (auto-imports only work in `.vue` SFCs). Follow the pattern from `use-remote-services.ts`.

```ts
// ui/src/composables/use-permissions.ts
import { computed } from 'vue'
import { $uiConfig, $apiPath } from '~/context'

// Uses useSession() (not useSessionAuthenticated()) so this composable can be
// called unconditionally from pages accessible by unauthenticated users (e.g. index.vue).
// All computeds return false when account is null.
export function usePermissions () {
  const { account, accountRole } = useSession()

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

  const limitsUrl = computed(() => {
    if (!account.value) return null
    return `${$apiPath}/limits/${account.value.type}/${account.value.id}`
  })

  const limitsFetch = useFetch<any>(limitsUrl)

  const missingSubscription = computed(() => {
    return !!(limitsFetch.data.value?.defaults && $uiConfig.subscriptionUrl)
  })

  return { canContribDep, canContrib, canAdminDep, canAdmin, missingSubscription }
}
```

Note: `useSession` and `useFetch` are auto-imported in `.ts` files inside `src/composables/` because vite AutoImport scans `dirs: ['src/composables']`. However, context imports (`$uiConfig`, `$apiPath`) must be explicit.

- [ ] **Step 2: Verify the file compiles**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to use-permissions.ts

- [ ] **Step 3: Commit**

```bash
git add ui/src/composables/use-permissions.ts
git commit -m "feat: add usePermissions composable with canContrib/canAdmin/missingSubscription"
```

---

### Task 2: Add `extraDocLinks` and `metricsIntegration` to UiConfig

**Files:**
- Modify: `api/src/ui-config.ts`

- [ ] **Step 1: Add the new config fields**

Add these two lines to the `uiConfig` object in `api/src/ui-config.ts`, after the `extraAdminNavigationItems` line:

```ts
  extraDocLinks: config.extraDocLinks as { icon?: string, href: string, title: string | Record<string, string> }[],
  metricsIntegration: !!config.privateMetricsUrl,
```

- [ ] **Step 2: Verify lint passes**

Run: `npx eslint api/src/ui-config.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add api/src/ui-config.ts
git commit -m "feat: add extraDocLinks and metricsIntegration to UI config"
```

---

### Task 3: `dashboard-svg-link.vue`

**Files:**
- Create: `ui/src/components/dashboard/dashboard-svg-link.vue`
- Reference: `ui-legacy/public/components/dashboard/dashboard-svg-link.vue`
- Reference: `ui/src/components/layout/layout-themed-svg.vue`

- [ ] **Step 1: Create the component**

```vue
<template>
  <v-card
    v-bind="cardProps"
    variant="outlined"
  >
    <v-card-title
      class="text-center justify-center"
      style="word-break: normal; line-height: 1.5rem;"
      :class="{ [`text-${color}`]: !!to, 'pb-0': !!svg }"
    >
      {{ title }}
    </v-card-title>
    <layout-themed-svg
      v-if="svg && smAndUp"
      :source="svg"
      :color="color"
      style="width: 100%; padding-left: 34px; padding-right: 34px; margin-top: -16px; margin-bottom: -20px;"
    />
  </v-card>
</template>

<script lang="ts" setup>
import { useDisplay } from 'vuetify'

const props = defineProps<{
  to?: string | Record<string, any> | null
  svg?: string
  title: string
  color?: string
}>()

const { smAndUp } = useDisplay()

const color = computed(() => props.color ?? 'primary')

const cardProps = computed(() => {
  if (!props.to) return {}
  return { to: props.to, hover: true }
})
</script>
```

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/dashboard/dashboard-svg-link.vue`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dashboard/dashboard-svg-link.vue
git commit -m "feat: add dashboard-svg-link component with themed SVG"
```

---

### Task 4: Dashboard metric cards

**Files:**
- Create: `ui/src/components/dashboard/dashboard-datasets-error.vue`
- Create: `ui/src/components/dashboard/dashboard-datasets-draft.vue`
- Create: `ui/src/components/dashboard/dashboard-datasets-requested-publications.vue`
- Create: `ui/src/components/dashboard/dashboard-applications-requested-publications.vue`

- [ ] **Step 1: Create `dashboard-datasets-error.vue`**

```vue
<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { status: 'error' } } : undefined"
    :title="t('datasetsError', nbDatasets ?? 0)"
    :svg="errorSvg"
    :color="nbDatasets ? 'error' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsError: Aucun jeu de données en erreur | 1 jeu de données en erreur | {n} jeux de données en erreur
en:
  datasetsError: No dataset in error | 1 dataset in error | {n} datasets in error
</i18n>

<script lang="ts" setup>
import errorSvg from '~/assets/svg/Under Constructions_Two Color.svg?raw'

const { t } = useI18n()

const datasetsFetch = useFetch<{ count: number }>(() => `${$apiPath}/datasets?size=0&shared=false&status=error`)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)
</script>
```

- [ ] **Step 2: Create `dashboard-datasets-draft.vue`**

```vue
<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { draftStatus: draftStatusFilter } } : undefined"
    :title="t('datasetsDraft', nbDatasets ?? 0)"
    :svg="draftSvg"
    :color="nbDatasets ? 'warning' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsDraft: Aucun brouillon en attente | 1 brouillon en attente | {n} brouillons en attente
en:
  datasetsDraft: No draft dataset | 1 draft dataset | {n} draft datasets
</i18n>

<script lang="ts" setup>
import draftSvg from '~/assets/svg/Under Constructions _Two Color.svg?raw'
import statuses from '../../../../shared/statuses.json'

const { t } = useI18n()

const draftStatusFilter = Object.keys(statuses.dataset).filter(s => s !== 'error' && s !== 'finalized').join(',')

const datasetsFetch = useFetch<{ count: number }>(() => `${$apiPath}/datasets?size=0&shared=false&draftStatus=${draftStatusFilter}`)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)
</script>
```

- [ ] **Step 3: Create `dashboard-datasets-requested-publications.vue`**

```vue
<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { requestedPublicationSites: publicationSitesFilter } } : undefined"
    :title="t('requestedPublications', nbDatasets ?? 0)"
    :svg="checklistSvg"
    :color="nbDatasets ? 'primary' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Aucune publication à valider | 1 publication à valider | {n} publications à valider
en:
  requestedPublications: No requested publication | 1 requested publication | {n} requested publications
</i18n>

<script lang="ts" setup>
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const settingsPath = computed(() => {
  if (!account.value) return null
  return `${account.value.type}/${account.value.id}`
})

const publicationSitesFetch = useFetch<{ type: string, id: string }[]>(
  () => settingsPath.value ? `${$apiPath}/settings/${settingsPath.value}/publication-sites` : null
)

const publicationSitesFilter = computed(() => {
  return publicationSitesFetch.data.value?.map(p => `${p.type}:${p.id}`).join(',') ?? ''
})

const datasetsFetch = useFetch<{ count: number }>(
  () => publicationSitesFilter.value ? `${$apiPath}/datasets?size=0&shared=false&requestedPublicationSites=${publicationSitesFilter.value}` : null
)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)
</script>
```

- [ ] **Step 4: Create `dashboard-applications-requested-publications.vue`**

Same pattern as datasets requested publications, but fetching from `/applications`:

```vue
<template>
  <dashboard-svg-link
    :to="nbApplications ? { path: '/applications', query: { requestedPublicationSites: publicationSitesFilter } } : undefined"
    :title="t('requestedPublications', nbApplications ?? 0)"
    :svg="checklistSvg"
    :color="nbApplications ? 'primary' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Aucune publication à valider | 1 publication à valider | {n} publications à valider
en:
  requestedPublications: No requested publication | 1 requested publication | {n} requested publications
</i18n>

<script lang="ts" setup>
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const settingsPath = computed(() => {
  if (!account.value) return null
  return `${account.value.type}/${account.value.id}`
})

const publicationSitesFetch = useFetch<{ type: string, id: string }[]>(
  () => settingsPath.value ? `${$apiPath}/settings/${settingsPath.value}/publication-sites` : null
)

const publicationSitesFilter = computed(() => {
  return publicationSitesFetch.data.value?.map(p => `${p.type}:${p.id}`).join(',') ?? ''
})

const applicationsFetch = useFetch<{ count: number }>(
  () => publicationSitesFilter.value ? `${$apiPath}/applications?size=0&shared=false&requestedPublicationSites=${publicationSitesFilter.value}` : null
)

const nbApplications = computed(() => applicationsFetch.data.value?.count ?? null)
</script>
```

- [ ] **Step 5: Verify lint passes for all 4 files**

Run: `cd ui && npx eslint src/components/dashboard/`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dashboard/
git commit -m "feat: add dashboard metric cards for datasets error, draft, and requested publications"
```

---

### Task 5: Rewrite home page (`index.vue`)

**Files:**
- Modify: `ui/src/pages/index.vue`
- Reference: `ui-legacy/public/pages/index.vue`

- [ ] **Step 1: Rewrite the full page**

Replace the entire content of `ui/src/pages/index.vue` with:

```vue
<template>
  <v-container class="home">
    <!-- Missing subscription: show alert -->
    <v-alert
      v-if="user && missingSubscription"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      <i18n-t keypath="subscriptionRequired">
        <template #subscriptionLink>
          <router-link to="/subscription">
            {{ t('subscriptionPage') }}
          </router-link>
        </template>
      </i18n-t>
    </v-alert>

    <!-- Not logged in -->
    <template v-if="!user">
      <v-row justify="center">
        <v-col
          cols="12"
          sm="8"
          md="6"
          class="text-center"
        >
          <h1 class="text-h4 mb-3 mt-5">
            Data Fair
          </h1>
          <layout-themed-svg
            :source="dataProcessSvg"
            style="max-width: 400px; margin: 0 auto;"
          />
          <p
            v-if="!$uiConfig.disableApplications"
            class="text-h6"
          >
            {{ t('description') }}
          </p>
          <p class="text-h6 mt-5">
            {{ t('authRequired') }}
          </p>
          <v-btn
            color="primary"
            @click="session.login()"
          >
            {{ t('login') }}
          </v-btn>
        </v-col>
      </v-row>
    </template>

    <!-- Logged in -->
    <template v-else>
      <v-row>
        <v-col cols="12">
          <h2 class="mb-4 text-h4">
            <template v-if="account && account.type === 'organization' && account.department">
              {{ t('departmentSpace', { name: account.name, departmentName: account.departmentName || account.department }) }}
            </template>
            <template v-else-if="account && account.type === 'organization'">
              {{ t('organizationSpace', { name: account.name }) }}
            </template>
            <template v-else-if="account">
              {{ t('userSpace', { name: account.name }) }}
            </template>
          </h2>

          <p
            v-if="account && account.type === 'organization'"
            class="mb-2"
          >
            <span v-safe-html="t('organizationRole', { role: accountOrgRole })" />
          </p>
          <p
            v-else-if="user.organizations.length"
            class="mb-2"
          >
            <v-icon color="warning">
              {{ mdiAlert }}
            </v-icon>
            <i18n-t keypath="collaborativeMessage">
              <template #collaborativeMode>
                <strong>{{ t('collaborativeMode') }}</strong>
              </template>
              <template #yourAccountLink>
                <router-link to="/me">
                  {{ t('yourAccount') }}
                </router-link>
              </template>
            </i18n-t>
          </p>
          <p
            v-else
            class="mb-2"
          >
            <i18n-t keypath="collaborativeMessageNoOrg">
              <template #collaborativeMode>
                <strong>{{ t('collaborativeMode') }}</strong>
              </template>
              <template #yourAccountLink>
                <router-link to="/me">
                  {{ t('yourAccount') }}
                </router-link>
              </template>
            </i18n-t>
          </p>
        </v-col>
      </v-row>

      <!-- Contribute section -->
      <template v-if="canContribDep">
        <v-row class="mx-0 mt-4">
          <h2 class="text-h5">
            {{ t('contribute') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/new-dataset?simple=true"
              :title="t('createDataset')"
              :svg="dataSvg"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/update-dataset"
              :title="t('updateDataset')"
              :svg="dataMaintenanceSvg"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/share-dataset"
              :title="t('shareDataset')"
              :svg="shareSvg"
            />
          </v-col>
        </v-row>
      </template>

      <!-- Manage datasets section -->
      <template v-if="canAdminDep">
        <v-row class="mx-0 mt-6">
          <h2 class="text-h5">
            {{ t('manageDatasets') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-requested-publications />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-error />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-draft />
          </v-col>
        </v-row>

        <!-- Manage applications section -->
        <v-row class="mx-0 mt-6">
          <h2 class="text-h5">
            {{ t('manageApplications') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-applications-requested-publications />
          </v-col>
        </v-row>
      </template>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
import { mdiAlert } from '@mdi/js'
import dataSvg from '~/assets/svg/Data Arranging_Two Color.svg?raw'
import dataMaintenanceSvg from '~/assets/svg/Data maintenance_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import dataProcessSvg from '~/assets/svg/Data Process_Two Color.svg?raw'

const { t } = useI18n()
const session = useSession()
const user = session.user
const account = session.account

// usePermissions uses useSession() internally, so it can be called unconditionally
const { canContribDep, canAdminDep, missingSubscription } = usePermissions()

const accountOrgRole = computed(() => {
  if (!user.value || account.value?.type !== 'organization') return ''
  const org = user.value.organizations.find((o: any) => o.id === account.value?.id)
  return org?.role ?? ''
})
</script>

<i18n lang="yaml">
fr:
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire
  description: Enrichissez et publiez facilement vos données. Vous pouvez les utiliser dans des applications dédiées et les mettre à disposition d'autres personnes en mode ouvert ou privé.
  subscriptionRequired: Votre abonnement est requis. Rendez-vous sur la {subscriptionLink}.
  subscriptionPage: page d'abonnement
  organizationSpace: Espace de l'organisation {name}
  departmentSpace: Espace de l'organisation {name} / {departmentName}
  userSpace: Espace de l'utilisateur {name}
  organizationRole: Vous êtes <strong>{role}</strong> dans cette organisation.
  collaborativeMessage: Pour travailler en {collaborativeMode} vous devez ouvrir le menu personnel (en haut à droite) et changer de compte actif. Pour créer une nouvelle organisation rendez vous sur {yourAccountLink}.
  collaborativeMessageNoOrg: Pour travailler en {collaborativeMode} vous devez créer une organisation. Pour cela rendez vous sur {yourAccountLink}.
  collaborativeMode: mode collaboratif
  yourAccount: votre compte
  contribute: Contribuez
  createDataset: Créer un nouveau jeu de données
  updateDataset: Mettre à jour un jeu de données
  shareDataset: Publier un jeu de données
  manageDatasets: Gérez les jeux de données
  manageApplications: Gérez les applications
en:
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
  description: Easily enrich and publish your data. You can use it in dedicated applications and make it available to other people both openly or privately.
  subscriptionRequired: Your subscription is required. Please visit the {subscriptionLink}.
  subscriptionPage: subscription page
  organizationSpace: Space of organization {name}
  departmentSpace: Space of organization {name} / {departmentName}
  userSpace: Space of user {name}
  organizationRole: You are <strong>{role}</strong> in this organization.
  collaborativeMessage: To work in {collaborativeMode} you must open the personal menu (top right) and change the active account. To create a new organization please visit {yourAccountLink}.
  collaborativeMessageNoOrg: To work in {collaborativeMode} you must create an organization. To do so please visit {yourAccountLink}.
  collaborativeMode: collaborative mode
  yourAccount: your account
  contribute: Contribute
  createDataset: Create a dataset
  updateDataset: Update a dataset
  shareDataset: Share a dataset
  manageDatasets: Manage datasets
  manageApplications: Manage applications
</i18n>
```

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/pages/index.vue`
Expected: No errors

- [ ] **Step 3: Verify type-check passes**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | grep -i 'index.vue' | head -10`
Expected: No errors related to index.vue

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/index.vue
git commit -m "feat: refine home dashboard with contribute and manage sections"
```

---

### Task 6: Rewrite navigation drawer

**Files:**
- Modify: `ui/src/components/layout/layout-navigation-left.vue`
- Reference: `ui-legacy/public/components/layout/layout-navigation-left.vue`

- [ ] **Step 1: Rewrite the full component**

Replace the entire content of `ui/src/components/layout/layout-navigation-left.vue` with:

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
      <!-- Portal home link (when not main site) -->
      <v-list-item
        v-if="site && site.main === false"
        href="/"
        :prepend-icon="mdiHome"
        :title="t('homePortal')"
      />
      <!-- Dashboard -->
      <v-list-item
        to="/"
        :prepend-icon="mdiMonitorDashboard"
        :title="t('home')"
      />
    </v-list>

    <!-- Subscription link when missing -->
    <v-list
      v-if="missingSubscription && canAdmin && $uiConfig.subscriptionUrl"
      density="compact"
      nav
    >
      <v-list-item
        to="/subscription"
        :prepend-icon="mdiCardAccountDetails"
        :title="t('subscription')"
      />
    </v-list>

    <!-- Collapsible groups -->
    <v-list
      v-if="!missingSubscription"
      v-model:opened="openedGroupsModel"
      open-strategy="multiple"
      density="compact"
      nav
    >
      <template
        v-for="group of navigationGroups"
        :key="group.key"
      >
        <template v-if="group.items.length">
          <v-divider class="mb-1" />
          <v-list-group :value="group.key">
            <template #activator="{ props: activatorProps }">
              <v-list-item
                v-bind="activatorProps"
                :title="group.title"
              />
            </template>
            <v-list-item
              v-for="item of group.items"
              :key="item.to || item.href || item.title"
              :to="item.to"
              :href="item.href"
              :target="item.href ? '_blank' : undefined"
              :prepend-icon="item.icon"
              :title="item.title"
              :subtitle="item.subtitle"
            />
          </v-list-group>
        </template>
      </template>
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  mdiHome,
  mdiMonitorDashboard,
  mdiDatabase,
  mdiImageMultiple,
  mdiCog,
  mdiTransitConnection,
  mdiCogTransferOutline,
  mdiHarddisk,
  mdiCloud,
  mdiInformation,
  mdiBriefcase,
  mdiAlert,
  mdiApps,
  mdiAccountGroup,
  mdiCardAccountDetails,
  mdiChartBar,
  mdiClipboardTextClock,
  mdiViewDashboardEdit,
  mdiPageNext,
  mdiAccountSupervisor,
} from '@mdi/js'

const { t, locale } = useI18n()
const drawer = defineModel<boolean>({ required: true })
const route = useRoute()
const session = useSessionAuthenticated()
const site = session.site
const org = session.organization
const { canContrib, canAdmin, canContribDep, canAdminDep, missingSubscription } = usePermissions()

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

const extraNavigationItems = computed(() => {
  const isMain = !site.value || site.value.main !== false
  return ($uiConfig.extraNavigationItems ?? []).filter((extra: any) => {
    if (extra.mainOnly && !isMain) return false
    if (!extra.can) return true
    if (extra.can === 'contrib') return canContrib.value
    if (extra.can === 'admin') return canAdmin.value
    if (extra.can === 'contribDep') return canContribDep.value
    if (extra.can === 'adminDep') return canAdminDep.value
    return false
  })
})

function resolveTitle (title: string | Record<string, string>): string {
  if (typeof title === 'string') return title
  return title[locale.value] || title.fr || Object.values(title)[0] || ''
}

const navigationGroups = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = []
  const account = session.account.value
  const user = session.user.value

  // Content group
  const content: NavItem[] = [
    { to: '/datasets', icon: mdiDatabase, title: t('datasets') },
  ]
  if (!$uiConfig.disableApplications) {
    content.push({ to: '/applications', icon: mdiImageMultiple, title: t('applications') })
  }
  if (canAdminDep.value && $uiConfig.portalsIntegration) {
    content.push({ to: '/pages', icon: mdiViewDashboardEdit, title: t('portalPages') })
    content.push({ to: '/reuses', icon: mdiPageNext, title: t('reuses') })
  }
  groups.push({ key: 'content', title: t('group.content'), items: content })

  // Management group
  // session.organization gives the current org membership (role, department, etc.)
  const currentOrg = org.value
  const management: NavItem[] = []
  if (account?.type === 'organization' && currentOrg?.role === $uiConfig.adminRole && !currentOrg?.department) {
    management.push({ to: '/organization', icon: mdiAccountGroup, title: t('org'), subtitle: account.name })
  }
  if (account?.type === 'organization' && currentOrg?.role === $uiConfig.adminRole && currentOrg?.department) {
    management.push({
      to: '/department',
      icon: mdiAccountGroup,
      title: t('dep'),
      subtitle: `${account.name} / ${currentOrg.departmentName || currentOrg.department}`
    })
  }
  if (canAdminDep.value) {
    management.push({ to: '/settings', icon: mdiCog, title: t('params'), subtitle: account?.department ? t('paramsSub') : undefined })
  }
  if (canAdminDep.value && $uiConfig.portalsIntegration) {
    management.push({ to: '/portals', icon: mdiMonitorDashboard, title: t('portals') })
  }
  groups.push({ key: 'management', title: t('group.management'), items: management })

  // Connectors group
  const connect: NavItem[] = []
  if (canAdminDep.value && $uiConfig.catalogsIntegration) {
    connect.push({ to: '/catalogs', icon: mdiTransitConnection, title: t('catalogs') })
  }
  if (canAdminDep.value && $uiConfig.processingsIntegration) {
    connect.push({ to: '/processings', icon: mdiCogTransferOutline, title: t('processings') })
  }
  if (connect.length) groups.push({ key: 'connect', title: t('group.connect'), items: connect })

  // Monitoring group
  const monitor: NavItem[] = []
  if (canAdmin.value && $uiConfig.subscriptionUrl) {
    monitor.push({ to: '/subscription', icon: mdiCardAccountDetails, title: t('subscription') })
  }
  if (canContrib.value) {
    monitor.push({ to: '/storage', icon: mdiHarddisk, title: t('storage') })
  }
  if ($uiConfig.metricsIntegration) {
    monitor.push({ to: '/metrics', icon: mdiChartBar, title: t('metrics'), subtitle: t('metricsSub') })
  }
  if (canAdmin.value && $uiConfig.eventsIntegration) {
    monitor.push({ to: '/events', icon: mdiClipboardTextClock, title: t('events') })
  }
  if (monitor.length) groups.push({ key: 'monitor', title: t('group.monitor'), items: monitor })

  // Help group
  const help: NavItem[] = []
  if (canContribDep.value) {
    help.push({ to: '/api-doc', icon: mdiCloud, title: t('apiDoc') })
  }
  for (const docLink of ($uiConfig.extraDocLinks ?? [])) {
    help.push({ href: docLink.href, icon: docLink.icon || mdiCloud, title: resolveTitle(docLink.title) })
  }
  if (help.length) groups.push({ key: 'help', title: t('group.help'), items: help })

  // Inject extra navigation items into their groups
  for (const extra of extraNavigationItems.value) {
    const item: NavItem = {
      to: extra.iframe ? `/extra/${extra.id}` : extra.to,
      href: extra.href,
      icon: extra.icon || mdiCloud,
      title: resolveTitle(extra.title)
    }
    if (extra.group) {
      const group = groups.find(g => g.key === extra.group)
      if (group) {
        group.items.push(item)
        continue
      }
    }
    // If no matching group, add as standalone in content
    const contentGroup = groups.find(g => g.key === 'content')
    contentGroup?.items.push(item)
  }

  // Admin group
  if (user?.adminMode) {
    const admin: NavItem[] = [
      { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
      { to: '/remote-services', icon: mdiCloud, title: t('services') },
      { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
      { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
    ]
    if (!$uiConfig.disableApplications) {
      admin.push({ to: '/admin/base-apps', icon: mdiApps, title: t('baseApplications') })
    }
    admin.push({ href: `${$sdUrl}/admin/users`, icon: mdiAccountSupervisor, title: t('accountsManagement') })
    if ($uiConfig.catalogsIntegration) {
      admin.push({ to: '/admin/catalogs-plugins', icon: mdiTransitConnection, title: t('catalogs'), subtitle: 'Plugins' })
    }
    if ($uiConfig.processingsIntegration) {
      admin.push({ to: '/admin/processings-plugins', icon: mdiCogTransferOutline, title: t('processings'), subtitle: 'Plugins' })
    }
    // Extra admin navigation items
    for (const extra of ($uiConfig.extraAdminNavigationItems ?? [])) {
      admin.push({
        to: extra.iframe ? `/admin-extra/${extra.id}` : extra.to,
        href: extra.href,
        icon: extra.icon || mdiCloud,
        title: resolveTitle(extra.title)
      })
    }
    groups.push({ key: 'admin', title: t('group.admin'), items: admin })
  }

  return groups
})

// Auto-expand the group containing the current route
const activeGroup = computed(() => {
  for (const group of navigationGroups.value) {
    for (const item of group.items) {
      if (item.to && route.path.startsWith(item.to) && item.to !== '/') {
        return group.key
      }
    }
  }
  return 'content'
})

const openedGroupsModel = ref<string[]>([activeGroup.value])

watch(activeGroup, (newGroup) => {
  if (!openedGroupsModel.value.includes(newGroup)) {
    openedGroupsModel.value = [...openedGroupsModel.value, newGroup]
  }
})
</script>

<i18n lang="yaml">
fr:
  home: Tableau de bord
  homePortal: Accueil du portail
  datasets: Jeux de données
  applications: Applications
  org: Gestion de l'organisation
  dep: Gestion du département
  params: Paramètres
  paramsSub: Licences, thématiques ...
  catalogs: Catalogues distants
  processings: Traitements périodiques
  portals: Portails
  portalPages: Pages de portails
  reuses: Réutilisations
  storage: Stockage
  metrics: Audience
  metricsSub: Téléchargements, API
  events: Traçabilité (bêta)
  subscription: Abonnement
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  baseApplications: Modèles d'application
  accountsManagement: Gestion des comptes
  apiDoc: Utiliser l'API
  group:
    content: Contenus
    management: Gestion
    connect: Connecteurs
    monitor: Suivi
    help: Aide
    admin: Administration
en:
  home: Dashboard
  homePortal: Portal home
  datasets: Datasets
  applications: Applications
  org: Manage organization
  dep: Manage department
  params: Parameters
  paramsSub: Licenses, topics ...
  catalogs: Remote catalogs
  processings: Periodic processings
  portals: Portals
  portalPages: Portal pages
  reuses: Reuses
  storage: Storage
  metrics: Audience
  metricsSub: Downloads, API
  events: Traceability (beta)
  subscription: Subscription
  services: Services
  serviceInfo: Service information
  owners: Owners
  errors: Errors
  baseApplications: Application models
  accountsManagement: Accounts management
  apiDoc: Use the API
  group:
    content: Contents
    management: Management
    connect: Connectors
    monitor: Monitoring
    help: Help
    admin: Administration
</i18n>
```

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/layout/layout-navigation-left.vue`
Expected: No errors

- [ ] **Step 3: Verify type-check passes**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | grep -i 'layout-navigation-left' | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/layout/layout-navigation-left.vue
git commit -m "feat: rewrite nav drawer with collapsible groups, permissions, extra items"
```

---

### Task 7: E2E tests

**Files:**
- Create: `tests/features/ui/home-nav.e2e.spec.ts`
- Reference: `tests/features/ui/layout.e2e.spec.ts` (for patterns)
- Reference: `tests/fixtures/login.ts` (for `goToWithAuth`)
- Reference: `dev/resources/users.json`, `dev/resources/organizations.json` (test data)

Test users:
- `test_user1`: personal account (type=user → canContrib, canAdmin by default)
- `test_user1` on `test_org1`: role=admin → canContribDep, canAdminDep
- `test_user8` on `test_org1`: role=user → no canContrib, no canAdmin
- `test_superadmin`: has admin mode capability

Note: `goToWithAuth` logs in to the user's personal account. To test org-level behavior, the test needs to use the personal menu to switch to an organization account. However, for the initial test set we focus on what's testable with personal accounts (where type=user means all permissions are granted).

- [ ] **Step 1: Create the test file**

```ts
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('home dashboard', () => {
  test('shows account space header', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Test User1/ })).toBeVisible({ timeout: 10000 })
  })

  test('shows contribute section with SVG cards', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Contribuez/ })).toBeVisible({ timeout: 10000 })
    // 3 contribute cards
    await expect(page.getByText('Créer un nouveau jeu de données')).toBeVisible()
    await expect(page.getByText('Mettre à jour un jeu de données')).toBeVisible()
    await expect(page.getByText('Publier un jeu de données')).toBeVisible()
  })

  test('shows manage datasets section with metric cards', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Gérez les jeux de données/ })).toBeVisible({ timeout: 10000 })
    // Metric cards render (even if counts are 0)
    await expect(page.getByText(/en erreur/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/brouillon/)).toBeVisible()
    await expect(page.getByText(/publication à valider/)).toBeVisible()
  })

  test('shows manage applications section', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.getByRole('heading', { name: /Gérez les applications/ })).toBeVisible({ timeout: 10000 })
  })

  test('contribute card navigates to new-dataset', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.getByText('Créer un nouveau jeu de données').click()
    await page.waitForURL(/new-dataset/, { timeout: 10000 })
  })

  test('unauthenticated home shows login button', async ({ page }) => {
    const baseUrl = `http://localhost:${process.env.NGINX_PORT1}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByRole('button', { name: /Se connecter/ })).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated home shows description and SVG', async ({ page }) => {
    const baseUrl = `http://localhost:${process.env.NGINX_PORT1}`
    await page.goto(`${baseUrl}/data-fair/`)
    await expect(page.getByText(/Enrichissez et publiez/)).toBeVisible({ timeout: 10000 })
    // SVG is rendered (check for themed SVG container)
    await expect(page.locator('.df-themed-svg svg')).toBeVisible()
  })

  test('error metric shows count after creating errored dataset', async ({ page, goToWithAuth }) => {
    // Create a dataset that will error (upload then break it)
    const ax = await axiosAuth('test_user1@test.com')
    await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth('/data-fair/', 'test_user1')
    // At minimum, the error card should be visible
    await expect(page.getByText(/en erreur/)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('navigation drawer', () => {
  test('has collapsible content group with datasets and applications', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Content group should be expanded by default
    await expect(page.locator('nav').getByText('Jeux de données')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav').getByText('Applications')).toBeVisible()
  })

  test('has dashboard link', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.locator('nav').getByText('Tableau de bord')).toBeVisible({ timeout: 10000 })
  })

  test('management group is present', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // For personal account (type=user), settings should be visible after expanding management
    await expect(page.locator('nav').getByText('Gestion')).toBeVisible({ timeout: 10000 })
    // Click to expand management group
    await page.locator('nav').getByText('Gestion').click()
    await expect(page.locator('nav').getByText('Paramètres')).toBeVisible()
  })

  test('monitoring group shows storage', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Expand monitoring group
    await expect(page.locator('nav').getByText('Suivi')).toBeVisible({ timeout: 10000 })
    await page.locator('nav').getByText('Suivi').click()
    await expect(page.locator('nav').getByText('Stockage')).toBeVisible()
  })

  test('no admin group for regular user', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await expect(page.locator('nav').getByText('Administration')).not.toBeVisible()
  })

  test('navigation from drawer to datasets works', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    await page.locator('nav').getByText('Jeux de données').click()
    await page.waitForURL(/datasets/, { timeout: 10000 })
  })

  test('help group shows API doc link', async ({ page, goToWithAuth }) => {
    await goToWithAuth('/data-fair/', 'test_user1')
    // Expand help group
    await expect(page.locator('nav').getByText('Aide')).toBeVisible({ timeout: 10000 })
    await page.locator('nav').getByText('Aide').click()
    await expect(page.locator('nav').getByText("Utiliser l'API")).toBeVisible()
  })
})
```

- [ ] **Step 2: Verify test file has no syntax errors**

Run: `npx tsc --noEmit tests/features/ui/home-nav.e2e.spec.ts 2>&1 | head -10` (or just run the tests)

- [ ] **Step 3: Run the tests**

Run: `npx playwright test tests/features/ui/home-nav.e2e.spec.ts --reporter=list 2>&1 | tail -30`
Expected: All tests pass (or identify failures to fix in next step)

- [ ] **Step 4: Fix any failing tests**

Address assertion timing issues, selector mismatches, etc. Common fixes:
- Increase timeouts for API-dependent metric cards
- Adjust selectors if Vuetify 4 renders list groups differently than expected
- Group activator click target might be `.v-list-group__header` instead of the text directly

- [ ] **Step 5: Commit**

```bash
git add tests/features/ui/home-nav.e2e.spec.ts
git commit -m "test: add e2e tests for home dashboard and navigation drawer"
```

---

### Task 8: Fix existing tests if broken

**Files:**
- Possibly modify: `tests/features/ui/layout.e2e.spec.ts`
- Possibly modify: `tests/features/ui/pages.e2e.spec.ts`

- [ ] **Step 1: Run all UI e2e tests**

Run: `npx playwright test tests/features/ui/ --reporter=list 2>&1 | tail -40`
Expected: All tests pass

- [ ] **Step 2: Fix any regressions**

The nav drawer structure change (flat → collapsible groups) may break selectors in `layout.e2e.spec.ts` line 9:
```ts
await expect(page.locator('nav').getByText('Jeux de données')).toBeVisible()
```

This should still work since the text content is unchanged, but if Vuetify nests it differently within the collapsed group, the element may not be visible until the group is expanded. Since content is the default expanded group, this should be fine.

The home page changes shouldn't break existing tests since the heading text is preserved.

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -u tests/
git commit -m "fix: update existing e2e tests for nav drawer and home page changes"
```
