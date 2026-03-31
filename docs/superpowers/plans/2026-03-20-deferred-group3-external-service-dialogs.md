# Group 3 — External Service Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build notifications subscription and webhooks dialogs that embed the external events service UI via iframes.

**Architecture:** Two thin dialog components wrapping iframes to the events service. URL is derived from `window.location.origin + '/events'`, gated by `$uiConfig.eventsIntegration` boolean. Both are shared between datasets and applications.

**Tech Stack:** Vue 3, Vuetify 4, iframe embedding

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 3

---

### Task 1: Notifications Dialog

**Files:**
- Create: `ui/src/components/common/notifications-dialog.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-actions.vue` lines 560-575

- [ ] **Step 1: Check webhooks schema for event keys**

The legacy code imports `webhooksSchema` to get event key constants. Find where this schema lives:

```bash
grep -r "webhooksSchema\|webhooks.*schema" ui-legacy/public/ --include="*.vue" --include="*.js" -l
```

Check the schema to understand the event key format (e.g., `dataset-data-updated`, `dataset-error`, etc.).

- [ ] **Step 2: Create notifications-dialog.vue**

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="700"
    :fullscreen="$vuetify.display.smAndDown"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('notifications') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="dialog = false"
        />
      </v-toolbar>
      <v-card-text
        v-if="dialog"
        class="pa-0"
      >
        <iframe
          :src="iframeUrl"
          style="width: 100%; height: 500px; border: none;"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  notifications: Notifications
en:
  notifications: Notifications
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  resource: { id: string, slug: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'datasets' | 'applications'
  eventPrefix: string
}>()

const { t } = useI18n()
const dialog = ref(false)

const eventsUrl = `${window.location.origin}/events`

const iframeUrl = computed(() => {
  const prefix = props.eventPrefix
  const slug = props.resource.slug

  // Build event keys — use slug-based pattern matching
  const keys = `data-fair:${prefix}-${slug}-*`
  const titles = props.resource.title

  // Build sender
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department

  // Build URL template for notification links
  const urlTemplate = `${window.location.origin}/data-fair/${props.resourceType === 'datasets' ? 'dataset' : 'application'}/${props.resource.id}`

  const params = new URLSearchParams({
    key: keys,
    title: titles,
    'url-template': urlTemplate,
    sender,
    register: 'false'
  })

  return `${eventsUrl}/embed/subscribe?${params.toString()}`
})
</script>
```

- [ ] **Step 3: Wire into dataset-actions.vue**

Add after integration dialog, gated by `$uiConfig.eventsIntegration`:

```vue
<notifications-dialog
  v-if="$uiConfig.eventsIntegration"
  :resource="dataset"
  resource-type="datasets"
  event-prefix="dataset"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-bell</v-icon>
      </template>
      <v-list-item-title>{{ t('notifications') }}</v-list-item-title>
    </v-list-item>
  </template>
</notifications-dialog>
```

Add i18n: `notifications: Notifications` / `Notifications`

- [ ] **Step 4: Wire into application-actions.vue**

Same pattern with `event-prefix="application"`:

```vue
<notifications-dialog
  v-if="$uiConfig.eventsIntegration"
  :resource="application"
  resource-type="applications"
  event-prefix="application"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-bell</v-icon>
      </template>
      <v-list-item-title>{{ t('notifications') }}</v-list-item-title>
    </v-list-item>
  </template>
</notifications-dialog>
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/common/notifications-dialog.vue ui/src/components/dataset/dataset-actions.vue ui/src/components/application/application-actions.vue
git commit -m "feat: add notifications subscription dialog for datasets and applications"
```

---

### Task 2: Webhooks Dialog

**Files:**
- Create: `ui/src/components/common/webhooks-dialog.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-actions.vue` lines 575-585

- [ ] **Step 1: Create webhooks-dialog.vue**

Very similar to notifications but uses `/embed/subscribe-webhooks` endpoint and no `register` param:

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="700"
    :fullscreen="$vuetify.display.smAndDown"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('webhooks') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="dialog = false"
        />
      </v-toolbar>
      <v-card-text
        v-if="dialog"
        class="pa-0"
      >
        <iframe
          :src="iframeUrl"
          style="width: 100%; height: 500px; border: none;"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  webhooks: Webhooks
en:
  webhooks: Webhooks
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  resource: { id: string, slug: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'datasets' | 'applications'
  eventPrefix: string
}>()

const { t } = useI18n()
const dialog = ref(false)

const eventsUrl = `${window.location.origin}/events`

const iframeUrl = computed(() => {
  const keys = `data-fair:${props.eventPrefix}-${props.resource.slug}-*`
  const titles = props.resource.title

  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department

  const params = new URLSearchParams({
    key: keys,
    title: titles,
    sender
  })

  return `${eventsUrl}/embed/subscribe-webhooks?${params.toString()}`
})
</script>
```

- [ ] **Step 2: Wire into dataset-actions.vue (admin only)**

Add after notifications, gated by `$uiConfig.eventsIntegration` AND admin check:

```vue
<webhooks-dialog
  v-if="$uiConfig.eventsIntegration && can('setPermissions').value"
  :resource="dataset"
  resource-type="datasets"
  event-prefix="dataset"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="warning">mdi-webhook</v-icon>
      </template>
      <v-list-item-title>{{ t('webhooks') }}</v-list-item-title>
    </v-list-item>
  </template>
</webhooks-dialog>
```

Add i18n: `webhooks: Webhooks` / `Webhooks`

- [ ] **Step 3: Wire into application-actions.vue (admin only)**

Same pattern with `can('setPermissions')` (no `.value`):

```vue
<webhooks-dialog
  v-if="$uiConfig.eventsIntegration && can('setPermissions')"
  :resource="application"
  resource-type="applications"
  event-prefix="application"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="warning">mdi-webhook</v-icon>
      </template>
      <v-list-item-title>{{ t('webhooks') }}</v-list-item-title>
    </v-list-item>
  </template>
</webhooks-dialog>
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/common/webhooks-dialog.vue ui/src/components/dataset/dataset-actions.vue ui/src/components/application/application-actions.vue
git commit -m "feat: add webhooks dialog for datasets and applications (admin only)"
```
