# Agent Navigation Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose global navigation tools (get location, list pages, navigate) to the AI agent via WebMCP BroadcastChannel.

**Architecture:** `useFrameServer('data-fair')` in `main.ts` sets up the BroadcastChannel MCP server. Navigation groups logic is extracted from the sidebar into a shared composable. A navigation tools composable registers 3 tools via `useAgentTool()`. Tools are called from `default-layout.vue` when agent chat is enabled.

**Tech Stack:** Vue 3, `@data-fair/lib-vue-agents` (WebMCP polyfill, BrowserMcpServer, FrameServerTransport), vue-router

**Spec:** `docs/superpowers/specs/2026-03-23-agent-navigation-tools-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `ui/src/main.ts` | Modify | Add `useFrameServer('data-fair')` after app mount |
| `ui/src/composables/use-navigation-items.ts` | Create | Extracted navigation groups computed + types |
| `ui/src/composables/use-agent-navigation-tools.ts` | Create | Registers 3 MCP tools for navigation |
| `ui/src/components/layout/layout-navigation-left.vue` | Modify | Import from `useNavigationItems()` |
| `ui/src/layouts/default-layout.vue` | Modify | Call `useAgentNavigationTools()` |

---

### Task 1: Add `useFrameServer` to `main.ts`

**Files:**
- Modify: `ui/src/main.ts`

- [ ] **Step 1: Add import and call `useFrameServer`**

Add the import at the top with the other imports, and call `useFrameServer('data-fair')` after `app.mount('#app')` (the app must be mounted first so `navigator.modelContext` is available to components):

```ts
// Add to imports (after the dFrameContent import, line 15):
import { useFrameServer } from '@data-fair/lib-vue-agents'
```

```ts
// Add after app.mount('#app') (after line 64):
  useFrameServer('data-fair')
```

Note: `useFrameServer` is called outside a Vue component setup context. It uses `onScopeDispose` internally but in `main.ts` there is no scope to dispose (the app lives for the entire page lifetime), which is fine.

- [ ] **Step 2: Commit**

```bash
git add ui/src/main.ts
git commit -m "feat: initialize WebMCP frame server in main.ts"
```

---

### Task 2: Extract navigation items into shared composable

**Files:**
- Create: `ui/src/composables/use-navigation-items.ts`
- Modify: `ui/src/components/layout/layout-navigation-left.vue`

- [ ] **Step 1: Create `use-navigation-items.ts`**

Extract the types (`NavItem`, `NavGroup`), `extraNavigationItems` computed, `resolveTitle` helper, and `navigationGroups` computed from `layout-navigation-left.vue` (lines 131–291) into this new composable. The composable uses the same dependencies: `useSessionAuthenticated()`, `usePermissions()`, `useI18n()`, `$uiConfig`, `$sdUrl`.

```ts
// ui/src/composables/use-navigation-items.ts
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '~/composables/use-permissions'
import { $uiConfig, $sdUrl } from '~/context'
import {
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
  mdiRobotOutline,
} from '@mdi/js'

export interface NavItem {
  to?: string
  href?: string
  icon: string
  title: string
  subtitle?: string
}

export interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

export function useNavigationItems () {
  const { t, locale } = useI18n()
  const session = useSessionAuthenticated()
  const site = session.site
  const org = session.organization
  const { canContrib, canAdmin, canContribDep, canAdminDep } = usePermissions()

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
    if (canAdminDep.value && $uiConfig.agentsIntegration) {
      management.push({ to: '/agents', icon: mdiRobotOutline, title: t('agents') })
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

  return { navigationGroups }
}
```

Note: the `mdiMonitorDashboard` icon import is needed inside the composable for the portals nav item. The `mdiHome` icon stays only in the component (used in the template, not in navigation groups). Check that all icon imports needed by the `navigationGroups` computed are in this file.

- [ ] **Step 2: Update `layout-navigation-left.vue` to use the composable**

Replace the inline types, `extraNavigationItems`, `resolveTitle`, and `navigationGroups` computed (lines 131–291) with an import. Remove icon imports that are now only used in the composable. Keep `mdiHome`, `mdiMonitorDashboard`, `mdiCardAccountDetails` which are still used directly in the template.

The `<script>` section becomes:

```ts
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { usePermissions } from '~/composables/use-permissions'
import { useNavigationItems } from '~/composables/use-navigation-items'
import {
  mdiHome,
  mdiMonitorDashboard,
  mdiCardAccountDetails,
} from '@mdi/js'

const { t } = useI18n()
const drawer = defineModel<boolean>({ required: true })
const route = useRoute()
const session = useSessionAuthenticated()
const site = session.site
const { canAdmin, missingSubscription } = usePermissions()
const { navigationGroups } = useNavigationItems()

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
```

The template and `<i18n>` block stay unchanged. The `<i18n>` block still has the translations — they are used by both the composable (via `useI18n`) and the component. Since both share the same i18n instance, the translations defined in the component's `<i18n>` block remain accessible.

**Important:** Verify that the `org` variable (used in the template's subscription link condition) is still available. If not used in template, it can be removed. Check that `$uiConfig` is still imported (used in template for `missingSubscription` condition).

- [ ] **Step 3: Verify the app still builds**

```bash
cd ui && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/composables/use-navigation-items.ts ui/src/components/layout/layout-navigation-left.vue
git commit -m "refactor: extract navigation items into shared composable"
```

---

### Task 3: Create agent navigation tools composable

**Files:**
- Create: `ui/src/composables/use-agent-navigation-tools.ts`

- [ ] **Step 1: Create the composable**

```ts
// ui/src/composables/use-agent-navigation-tools.ts
import { useRoute, useRouter } from 'vue-router'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { useNavigationItems } from '~/composables/use-navigation-items'
import { useBreadcrumbs } from '~/composables/use-breadcrumbs'

export function useAgentNavigationTools () {
  const route = useRoute()
  const router = useRouter()
  const { navigationGroups } = useNavigationItems()
  const breadcrumbs = useBreadcrumbs()

  useAgentTool({
    name: 'get_current_location',
    description: 'Get the current page location in the application, including route path, name, parameters, and breadcrumbs.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: route.path,
            name: route.name,
            params: route.params,
            query: route.query,
            breadcrumbs: breadcrumbs.items.value.map(b => ({
              text: b.text,
              to: b.to
            }))
          })
        }]
      }
    }
  })

  useAgentTool({
    name: 'list_pages',
    description: 'List all available pages in the application that the current user can access, organized by group (content, management, connectors, monitoring, help, admin).',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const pages = navigationGroups.value.flatMap(group =>
        group.items
          .filter(item => item.to)
          .map(item => ({
            group: group.title,
            title: item.title,
            path: item.to,
            subtitle: item.subtitle
          }))
      )
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(pages)
        }]
      }
    }
  })

  useAgentTool({
    name: 'navigate',
    description: 'Navigate to a page in the application. Use list_pages to discover available paths.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to navigate to (e.g. "/datasets", "/dataset/abc123")'
        }
      },
      required: ['path']
    },
    execute: async (params) => {
      try {
        await router.push(params.path)
        // Wait for the target page to mount and register contextual tools
        await new Promise(resolve => setTimeout(resolve, 500))
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, newPath: router.currentRoute.value.path })
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, error: error.message })
          }]
        }
      }
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/composables/use-agent-navigation-tools.ts
git commit -m "feat: add agent navigation tools composable"
```

---

### Task 4: Wire up tools in default layout

**Files:**
- Modify: `ui/src/layouts/default-layout.vue`

- [ ] **Step 1: Import and call `useAgentNavigationTools`**

Add the import and a conditional call. Since `useAgentTool` uses `onScopeDispose`, it must be called synchronously in `<script setup>`. The tools register on `navigator.modelContext` which is already wired to the BroadcastChannel by `useFrameServer` in `main.ts`.

```ts
// Add to imports:
import { useAgentNavigationTools } from '~/composables/use-agent-navigation-tools'

// Add after the showAgentChat computed (after line 40):
if (showAgentChat.value) {
  useAgentNavigationTools()
}
```

**Note:** `showAgentChat` is a computed that depends on an async fetch. At script setup time, `showAgentChat.value` may be `false` because the fetch hasn't resolved yet. If this is an issue, consider using `watchEffect` to register tools when `showAgentChat` becomes true. However, since `useAgentTool` uses `onScopeDispose` for cleanup, calling it inside a `watchEffect` would require a separate `effectScope`. For the initial implementation, if the fetch resolves before setup completes (due to caching or SSR), the simple `if` works. Otherwise, adjust to:

```ts
import { watchEffect, effectScope } from 'vue'

let toolsScope: ReturnType<typeof effectScope> | null = null
watchEffect(() => {
  if (showAgentChat.value && !toolsScope) {
    toolsScope = effectScope()
    toolsScope.run(() => {
      useAgentNavigationTools()
    })
  }
})
```

Use whichever pattern works — test by checking if the agent can call `list_pages` after the page loads.

- [ ] **Step 2: Verify the app builds**

```bash
cd ui && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/layouts/default-layout.vue
git commit -m "feat: register agent navigation tools in default layout"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server and verify sidebar still works**

Navigate through the app, check sidebar groups expand/collapse, links work, permission-based items appear correctly.

- [ ] **Step 2: Verify agent tools are registered**

Open browser console, check `navigator.modelContext` exists. If agent chat is enabled, verify the BroadcastChannel server is running.

- [ ] **Step 3: Test tool execution via console**

```js
// In browser console:
await navigator.modelContext.callTool('get_current_location', {})
await navigator.modelContext.callTool('list_pages', {})
await navigator.modelContext.callTool('navigate', { path: '/datasets' })
```
