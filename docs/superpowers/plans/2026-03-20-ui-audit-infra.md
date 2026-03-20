# D-Frame Infrastructure Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore full d-frame parity with legacy UI: breadcrumb display, deep URL sync via state-change-adapter, catch-all routes, proper iframe height, and notifications queue in the top bar.

**Architecture:** A `useBreadcrumbs()` composable manages breadcrumb state via provide/inject. Each d-frame page gets the `:adapter` prop and a `@message` handler. Catch-all `[...page].vue` routes enable deep URL sync. A `notifications-queue.vue` component connects to the events service API.

**Tech Stack:** Vue 3, Vue Router 5 (with `vue-router/vite` file-based routing), Vuetify 4, `@data-fair/frame` (state-change-adapter), `@data-fair/lib-vue` (session, useFetch)

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Part 1

---

### Task 1: Create useBreadcrumbs composable

**Files:**
- Create: `ui/src/composables/use-breadcrumbs.ts`

- [ ] **Step 1: Create the composable**

```typescript
// ui/src/composables/use-breadcrumbs.ts
import { ref, type InjectionKey, inject, provide } from 'vue'
import { useRoute } from 'vue-router'

export interface BreadcrumbItem {
  text: string
  to?: string | { path: string; query?: Record<string, string> }
  exact?: boolean
}

const breadcrumbsKey: InjectionKey<ReturnType<typeof createBreadcrumbs>> = Symbol('breadcrumbs')

export function createBreadcrumbs () {
  const route = useRoute()
  const items = ref<BreadcrumbItem[]>([])
  const routeName = ref<string | null>(null)

  function receive (message: { breadcrumbs?: { text: string; to?: string }[] }) {
    if (!message.breadcrumbs) return
    items.value = message.breadcrumbs.map(b => ({
      ...b,
      exact: true,
      to: b.to ? { path: b.to } : undefined
    }))
    routeName.value = (route.name as string) ?? null
  }

  function clear () {
    items.value = []
    routeName.value = null
  }

  return { items, routeName, receive, clear }
}

export function provideBreadcrumbs () {
  const breadcrumbs = createBreadcrumbs()
  provide(breadcrumbsKey, breadcrumbs)
  return breadcrumbs
}

export function useBreadcrumbs () {
  const breadcrumbs = inject(breadcrumbsKey)
  if (!breadcrumbs) throw new Error('useBreadcrumbs() called without provideBreadcrumbs()')
  return breadcrumbs
}
```

- [ ] **Step 2: Provide breadcrumbs in default-layout.vue**

Modify `ui/src/layouts/default-layout.vue` to provide the breadcrumbs context:

```typescript
// Add import
import { provideBreadcrumbs } from '~/composables/use-breadcrumbs'

// In setup
const breadcrumbs = provideBreadcrumbs()
```

Pass breadcrumbs to the top bar:

```vue
<layout-navigation-top v-model:drawer="drawer" :breadcrumbs="breadcrumbs" />
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/composables/use-breadcrumbs.ts ui/src/layouts/default-layout.vue
git commit -m "feat: add useBreadcrumbs composable with provide/inject"
```

---

### Task 2: Add breadcrumb rendering to top bar

**Files:**
- Modify: `ui/src/components/layout/layout-navigation-top.vue`

- [ ] **Step 1: Add breadcrumbs prop and rendering**

Update `layout-navigation-top.vue`:

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
    <v-breadcrumbs
      v-if="showBreadcrumbs"
      :items="breadcrumbItems"
      class="text-body-2 ml-2"
    />
    <v-spacer />
    <df-personal-menu />
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import DfPersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import type { BreadcrumbItem } from '~/composables/use-breadcrumbs'

const drawer = defineModel<boolean>('drawer', { required: true })

import type { createBreadcrumbs } from '~/composables/use-breadcrumbs'

const props = defineProps<{
  breadcrumbs?: ReturnType<typeof createBreadcrumbs>
}>()

const route = useRoute()
const { mdAndUp } = useDisplay()

const showBreadcrumbs = computed(() => {
  if (!mdAndUp.value) return false
  if (!props.breadcrumbs) return false
  const bc = props.breadcrumbs
  return bc.items.value.length > 0 && bc.routeName.value === (route.name as string)
})

const breadcrumbItems = computed(() => {
  if (!props.breadcrumbs) return []
  return props.breadcrumbs.items.value.map(item => ({
    title: item.text,
    to: item.to,
    exact: item.exact
  }))
})
</script>
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix ui run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/layout/layout-navigation-top.vue
git commit -m "feat: render breadcrumbs in top navigation bar"
```

---

### Task 3: Add notifications queue to top bar

**Files:**
- Create: `ui/src/components/layout/layout-notifications-queue.vue`
- Modify: `ui/src/components/layout/layout-navigation-top.vue`

The legacy component (`ui-legacy/public/components/notifications-queue.vue`) fetches from `{eventsUrl}/api/v1/notifications` and subscribes to real-time updates via an event bus channel `user:{userId}:notifications`. The new version uses plain `fetch` instead of Vuex/axios.

**Note:** The legacy also subscribes to a WebSocket channel for real-time push updates. This version only polls on mount and menu open/close. Real-time WebSocket subscription is deferred — it requires integrating with the events service's WebSocket protocol, which is a larger scope.

- [ ] **Step 1: Create the notifications queue component**

Create `ui/src/components/layout/layout-notifications-queue.vue`:

```vue
<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    max-height="400"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        variant="text"
        class="px-0"
        v-bind="menuProps"
      >
        <v-badge
          :content="countNew"
          :model-value="!!countNew"
          color="pink"
          floating
        >
          <v-icon :icon="mdiBell" />
        </v-badge>
      </v-btn>
    </template>

    <v-list
      :width="500"
      density="compact"
    >
      <v-list-item v-if="loading">
        <v-list-item-title>
          {{ t('loading') }}
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else-if="notifications && notifications.length === 0">
        <v-list-item-title>
          {{ t('noNotif') }}
        </v-list-item-title>
      </v-list-item>
      <template v-else-if="notifications">
        <v-list-item
          v-for="notif in notifications"
          :key="notif._id"
          :href="notif.url"
          lines="three"
        >
          <v-list-item-title>
            {{ notifText(notif.title) }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ formatDate(notif.date) }}
          </v-list-item-subtitle>
          <v-list-item-subtitle v-if="notif.body">
            {{ notifText(notif.body) }}
          </v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue'
import { mdiBell } from '@mdi/js'

const props = defineProps<{
  eventsUrl: string
}>()

const { t } = useI18n()
const session = useSession()
const { localeDayjs } = useLocaleDayjs()

const menu = ref(false)
const countNew = ref<number | null>(null)
const notifications = ref<any[] | null>(null)
const loading = ref(false)

function notifText (text: string | Record<string, string>): string {
  if (typeof text === 'string') return text
  const lang = session.lang.value ?? 'fr'
  return text[lang] || text.fr || text.en || Object.values(text)[0] || ''
}

function formatDate (date: string): string {
  return localeDayjs.value(date).format('lll')
}

async function countNotifications () {
  try {
    const res = await fetch(`${props.eventsUrl}/api/v1/notifications?size=0&count=false`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    countNew.value = data.countNew ?? null
  } catch {
    // silently ignore — events service may not be available
  }
}

async function fetchNotifications () {
  loading.value = true
  try {
    const res = await fetch(`${props.eventsUrl}/api/v1/notifications?size=10&count=false`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    countNew.value = data.countNew ?? null
    notifications.value = data.results
  } catch {
    notifications.value = []
  } finally {
    loading.value = false
  }
}

watch(menu, (value) => {
  if (value) {
    fetchNotifications()
  } else {
    notifications.value = null
    countNotifications()
  }
})

onMounted(() => {
  countNotifications()
})
</script>

<i18n lang="yaml">
fr:
  loading: Chargement...
  noNotif: Aucune notification reçue
en:
  loading: Loading...
  noNotif: No notification received
</i18n>
```

- [ ] **Step 2: Wire into the top bar**

In `layout-navigation-top.vue`, add the notifications queue before `df-personal-menu`:

```vue
<layout-notifications-queue
  v-if="eventsUrl && user"
  :events-url="eventsUrl"
/>
<df-personal-menu />
```

Add to script:

```typescript
import LayoutNotificationsQueue from './layout-notifications-queue.vue'

const { user } = useSession()
const eventsUrl = computed(() => {
  // events service URL is origin + /events (same-origin convention)
  return $sitePath + '/events'
})
```

Use `$uiConfig.eventsIntegration` (boolean) for the conditional, and `$sitePath + '/events'` for the URL (consistent with existing components like `webhooks-dialog.vue` and `notifications-dialog.vue` which use the same pattern).

- [ ] **Step 3: Verify build**

Run: `npm --prefix ui run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/layout/layout-notifications-queue.vue ui/src/components/layout/layout-navigation-top.vue
git commit -m "feat: add notifications queue to top navigation bar"
```

---

### Task 4: Wire state-change-adapter and message handlers on d-frame pages

**Files:**
- Modify: `ui/src/pages/catalogs.vue`
- Modify: `ui/src/pages/processings.vue`
- Modify: `ui/src/pages/portals.vue`
- Modify: `ui/src/pages/events.vue`
- Modify: `ui/src/pages/reuses.vue`
- Modify: `ui/src/pages/pages.vue`
- Modify: `ui/src/pages/metrics.vue`
- Modify: `ui/src/pages/api-doc.vue`
- Modify: `ui/src/pages/admin/processings-plugins.vue`
- Modify: `ui/src/pages/admin/catalogs-plugins.vue`

All d-frame pages need the same additions:
1. `:adapter` prop bound to the state-change-adapter
2. `@message` and `@iframe-message` handlers that feed breadcrumbs into the composable
3. Height calculation using `window.innerHeight`

The pattern from the legacy:
```javascript
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
// :adapter.prop="stateChangeAdapter"
// :height="(windowHeight - 48) + 'px'"
// @message="message => onMessage(message.detail)"
// @iframe-message="message => onMessage(message.detail)"
```

- [ ] **Step 1: Create a shared composable for d-frame pages**

Create `ui/src/composables/use-d-frame-page.ts` to avoid repeating the same code in 10+ pages:

```typescript
// ui/src/composables/use-d-frame-page.ts
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useBreadcrumbs } from './use-breadcrumbs'

export function useDFramePage () {
  const router = useRouter()
  const breadcrumbs = useBreadcrumbs()
  const { height: windowHeight } = useWindowSize()

  // Create adapter once — do NOT use computed(), as each instance registers
  // a router.afterEach() listener. Recreating would leak listeners.
  const stateChangeAdapter = createStateChangeAdapter(router)

  const frameHeight = computed(() => (windowHeight.value - 48) + 'px')

  function onMessage (message: any) {
    const detail = message?.detail ?? message
    if (detail?.breadcrumbs) {
      breadcrumbs.receive(detail)
    }
  }

  return { stateChangeAdapter, frameHeight, onMessage }
}
```

`@vueuse/core` is already a dependency (v12.6.1 in `ui/package.json`).

- [ ] **Step 2: Update catalogs.vue as the reference implementation**

```vue
<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/catalogs/'"
    :height="frameHeight"
    sync-params
    :sync-path="$sitePath + '/data-fair/catalogs/'"
    emit-iframe-messages
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, frameHeight, onMessage } = useDFramePage()
</script>
```

- [ ] **Step 3: Update all remaining d-frame pages**

Apply the same pattern to each page. The only differences between pages are `id`, `src`, and `sync-path`. Some pages (metrics, api-doc, admin plugins) don't have `sync-path` or `emit-iframe-messages` — preserve their existing attributes, just add `:adapter.prop`, `:height`, `@message`, `@iframe-message`.

Pages with `sync-path` + `emit-iframe-messages` (need adapter + breadcrumbs):
- `processings.vue` — src: `/processings/processings/`, sync-path: `/data-fair/processings/`
- `portals.vue` — src: `/portals-manager/portals/`, sync-path: `/data-fair/portals/`
- `events.vue` — src: `/events/embed/events/`, sync-path: `/data-fair/events/`
- `reuses.vue` — src: `/portals-manager/reuses/`, sync-path: `/data-fair/reuses/`
- `pages.vue` — src: `/portals-manager/pages/`, sync-path: `/data-fair/pages/`

Pages without `sync-path` (adapter for consistency, but no breadcrumb path mapping):
- `metrics.vue` — src: `/metrics/embed/home`
- `api-doc.vue` — src: openapi-viewer URL
- `admin/processings-plugins.vue` — src: `/processings/admin/plugins/`
- `admin/catalogs-plugins.vue` — src: `/catalogs/admin/plugins/`

- [ ] **Step 4: Verify build**

Run: `npm --prefix ui run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add ui/src/composables/use-d-frame-page.ts ui/src/pages/catalogs.vue ui/src/pages/processings.vue ui/src/pages/portals.vue ui/src/pages/events.vue ui/src/pages/reuses.vue ui/src/pages/pages.vue ui/src/pages/metrics.vue ui/src/pages/api-doc.vue ui/src/pages/admin/processings-plugins.vue ui/src/pages/admin/catalogs-plugins.vue
git commit -m "feat: wire state-change-adapter and breadcrumb handlers on all d-frame pages"
```

---

### Task 5: Add catch-all routes for deep URL sync

**Files:**
- Modify: `ui/src/pages/catalogs.vue` (add `<RouterView />`)
- Create: `ui/src/pages/catalogs/[...page].vue`
- Same pattern for: processings, portals, events, reuses, pages

**How it works with `vue-router/vite`:** When both `pages/catalogs.vue` and `pages/catalogs/` directory exist, `catalogs.vue` becomes the parent layout for all child routes. It must include a `<RouterView />` to render children. The catch-all child `[...page].vue` is empty — it exists only so Vue Router captures deep URL segments for the state-change-adapter.

**Important:** Do NOT create `pages/catalogs/index.vue` — the d-frame is already in the parent `catalogs.vue`. An index child would cause double-rendering.

**Fallback:** If `vue-router/vite` does not produce the expected parent-child route tree, define catch-all routes manually in the router config instead of using file-based routing.

- [ ] **Step 1: Add `<RouterView />` to catalogs.vue**

Add `<RouterView />` after the `<d-frame>` element in `catalogs.vue`:

```vue
<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/catalogs/'"
    :height="frameHeight"
    sync-params
    :sync-path="$sitePath + '/data-fair/catalogs/'"
    emit-iframe-messages
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <RouterView />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, frameHeight, onMessage } = useDFramePage()
</script>
```

- [ ] **Step 2: Create catch-all route for catalogs**

Create `ui/src/pages/catalogs/[...page].vue`:

```vue
<template>
  <!-- Empty: exists only for Vue Router to capture deep URL segments -->
</template>
```

- [ ] **Step 3: Repeat for all d-frame pages with sync-path**

Add `<RouterView />` and create catch-all routes for:
- `processings.vue` + `processings/[...page].vue`
- `portals.vue` + `portals/[...page].vue`
- `events.vue` + `events/[...page].vue`
- `reuses.vue` + `reuses/[...page].vue`
- `pages.vue` + `pages/[...page].vue`

Pages without `sync-path` (metrics, api-doc, admin plugins) do NOT need catch-all routes.

- [ ] **Step 4: Verify routing works**

Run: `npm --prefix ui run build`
Then manually test: navigate to `/catalogs/some/deep/path` and verify it resolves to the catalogs page with the d-frame visible.

If the file-based routing does not produce the expected route tree, fall back to manual route definitions.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/catalogs.vue ui/src/pages/catalogs/ ui/src/pages/processings.vue ui/src/pages/processings/ ui/src/pages/portals.vue ui/src/pages/portals/ ui/src/pages/events.vue ui/src/pages/events/ ui/src/pages/reuses.vue ui/src/pages/reuses/ ui/src/pages/pages.vue ui/src/pages/pages/
git commit -m "feat: add catch-all routes for deep d-frame URL sync"
```

---

### Task 6: Clear breadcrumbs on route change

**Files:**
- Modify: `ui/src/composables/use-breadcrumbs.ts`

When navigating away from a d-frame page, breadcrumbs from the previous page should be cleared.

- [ ] **Step 1: Add route watcher to clear breadcrumbs**

In `createBreadcrumbs()`, add:

```typescript
import { watch } from 'vue'

// Inside createBreadcrumbs():
watch(() => route.name, () => {
  // Clear breadcrumbs when navigating to a different route
  // D-frame pages will re-set them via postMessage
  clear()
})
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/composables/use-breadcrumbs.ts
git commit -m "fix: clear breadcrumbs on route navigation"
```

---

### Task 7: E2e smoke test for d-frame pages

**Files:**
- Modify: `tests/features/ui/layout.e2e.spec.ts` (or create a new test file)

- [ ] **Step 1: Add d-frame smoke test**

Add a test that verifies a d-frame page loads and renders its iframe. Since external services (catalogs, processings) may not be running in the test environment, the test should verify the page loads without error and the d-frame element exists.

```typescript
test('d-frame page loads and renders iframe element', async ({ page }) => {
  // Navigate to catalogs (or another d-frame page available in test env)
  await page.goto('/data-fair/catalogs')
  // Verify d-frame custom element exists
  const dFrame = page.locator('d-frame#catalogs')
  await expect(dFrame).toBeAttached()
  // Verify it has the expected src attribute
  const src = await dFrame.getAttribute('src')
  expect(src).toContain('/catalogs/catalogs/')
})
```

Adapt the page and assertions based on which external services are available in the test environment.

- [ ] **Step 2: Run tests**

Run: `npx playwright test tests/features/ui/layout.e2e.spec.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/
git commit -m "test: add d-frame page smoke test"
```

---

### Implementation Notes

**d-frame `.prop` modifier:** The legacy uses `:adapter.prop="stateChangeAdapter"` — the `.prop` modifier ensures the value is set as a DOM property, not an HTML attribute. This is critical because d-frame is a custom element. Vue 3 supports `.prop` modifier on custom elements.

**d-frame custom element registration:** The `d-frame` custom element is registered by the `@data-fair/frame` package. The import `import dFrameContent from '@data-fair/frame/lib/vue-router/d-frame-content.js'` in `main.ts` has a side effect that registers the element. No additional import is needed in page components.

**`notifications.vue` is NOT a d-frame page:** Despite being listed as a d-frame page in the spec's Group 1, `notifications.vue` is a native Vue page with multiple `<d-frame>` elements (for subscription management). It does not need the adapter/breadcrumbs/catch-all treatment. It will be audited in Group 1 Task 1 for correct d-frame attributes on its individual frames.

**vue-router/vite (not unplugin-vue-router):** The project uses `vue-router/vite` (Vue Router 5.0's integrated file-based routing), not the separate `unplugin-vue-router` package. The behavior is similar but documentation references should use `vue-router/vite`.
