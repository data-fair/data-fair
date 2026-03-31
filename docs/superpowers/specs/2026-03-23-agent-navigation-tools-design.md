# Agent Navigation Tools Design

**Date**: 2026-03-23

## Goal

Expose global navigation tools to the AI agent so it can know where the user is in the app, list available pages, and suggest/perform navigations.

## Architecture

### WebMCP / BroadcastChannel stack

The `@data-fair/lib-vue-agents` library provides:
- **`useFrameServer(serverId)`** — wraps `navigator.modelContext` with a `BrowserMcpServer` connected via `BroadcastChannel`. Any tool registered via `navigator.modelContext.registerTool()` in that frame is exposed to the agent chat iframe.
- **`useAgentTool(tool)`** — registers a single tool on `navigator.modelContext`, auto-unregisters on scope dispose.
- **`getTabChannelId()`** — per-tab unique channel ID so multiple tabs don't interfere.

The agent chat iframe connects as a BroadcastChannel client and sees tools from all servers in the same tab.

### Frame server initialization

`useFrameServer('data-fair')` is called in `ui/src/main.ts` at app startup. This makes the main frame a tool server for the entire tab. Any `useAgentTool()` call anywhere in the main app automatically exposes tools to the agent.

Embed pages (d-frame iframes) will call their own `useFrameServer()` to expose contextual tools — this is out of scope for now but the architecture supports it.

## Navigation items extraction

The sidebar navigation groups (permission-filtered, i18n'd page list) are currently defined inline in `layout-navigation-left.vue`. This logic is extracted into a shared composable `useNavigationItems()` so both the sidebar UI and the agent tools can use it.

### `ui/src/composables/use-navigation-items.ts`

Exports:
- `NavItem` type: `{ to?: string, href?: string, icon: string, title: string, subtitle?: string }`
- `NavGroup` type: `{ key: string, title: string, items: NavItem[] }`
- `useNavigationItems()` — returns `{ navigationGroups: ComputedRef<NavGroup[]> }`

The composable uses the same dependencies as the current inline logic: `useSessionAuthenticated()`, `usePermissions()`, `useI18n()`, `$uiConfig`.

## Agent navigation tools

### `ui/src/composables/use-agent-navigation-tools.ts`

Called from `default-layout.vue` when agent chat is enabled. Registers 3 tools via `useAgentTool()`.

### Tool: `get_current_location`

- **Parameters**: none
- **Returns**: `{ path, name, params, query, breadcrumbs }`
  - `path`: current route path (e.g. `/dataset/abc123`)
  - `name`: route name (e.g. `/dataset/[id]/`)
  - `params`: route params object
  - `query`: route query object
  - `breadcrumbs`: current breadcrumb items `{ text, to? }[]`
- **Implementation**: reads from `useRoute()` and `useBreadcrumbs()`

### Tool: `list_pages`

- **Parameters**: none
- **Returns**: array of `{ group, title, path }` objects — flattened from navigation groups. Icons stripped (not useful to the agent). Only items with a `to` path are included (external `href` links excluded).
- **Implementation**: reads from `useNavigationItems()`

### Tool: `navigate`

- **Parameters**: `{ path: string }`
- **Returns**: `{ success: true, newPath }` or `{ success: false, error }`
- **Implementation**: calls `router.push(path)`, then waits ~500ms settle delay for the target page to mount and register contextual tools before returning.

## Files changed

| File | Change |
|------|--------|
| `ui/src/main.ts` | Add `useFrameServer('data-fair')` |
| `ui/src/composables/use-navigation-items.ts` | **New** — extracted navigation groups logic |
| `ui/src/composables/use-agent-navigation-tools.ts` | **New** — registers 3 navigation tools |
| `ui/src/components/layout/layout-navigation-left.vue` | Import from `useNavigationItems()` instead of inline logic |
| `ui/src/layouts/default-layout.vue` | Call `useAgentNavigationTools()` when agent chat enabled |
