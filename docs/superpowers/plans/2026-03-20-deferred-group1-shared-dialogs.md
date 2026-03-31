# Group 1 — Shared Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build shared dialog components (owner change, integration/embed code, slug editing) used by both dataset and application actions.

**Architecture:** Three shared components in `ui/src/components/common/` that receive resource data via props, avoiding direct store coupling. The `can()` API inconsistency (ComputedRef vs boolean) is handled by passing pre-resolved boolean props from parent components.

**Tech Stack:** Vue 3, Vuetify 4, `@data-fair/lib-vuetify` (owner-pick), `@data-fair/frame` (d-frame snippet generation)

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 1

---

### Task 1: Owner Change Dialog

**Files:**
- Create: `ui/src/components/common/owner-change-dialog.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Legacy implementation at `ui-legacy/public/components/dataset/dataset-actions.vue` lines 250-313

- [ ] **Step 1: Create owner-change-dialog.vue**

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="900"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-card-title>{{ t('changeOwnerTitle') }}</v-card-title>
      <v-card-text>
        <owner-pick
          v-model="newOwner"
          :current-owner="resource.owner"
        />
        <v-alert
          v-if="newOwner"
          type="warning"
          variant="outlined"
          class="mt-4"
        >
          <p>{{ t('changeOwnerWarning') }}</p>
          <ul>
            <li>{{ t('warnPermissions') }}</li>
            <li>{{ t('warnApps') }}</li>
            <li>{{ t('warnPortals') }}</li>
            <li>{{ t('warnCatalogs') }}</li>
            <li>{{ t('warnApiKeys') }}</li>
            <li>{{ t('warnProcessings') }}</li>
          </ul>
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="dialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          :disabled="!newOwner"
          @click="confirm"
        >
          {{ t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  changeOwnerTitle: Changer le propriétaire
  changeOwnerWarning: "Attention, le changement de propriétaire peut avoir les conséquences suivantes :"
  warnPermissions: Les permissions seront réinitialisées
  warnApps: Les applications qui utilisent cette ressource pourraient ne plus fonctionner
  warnPortals: Les publications sur les portails pourraient être affectées
  warnCatalogs: Les publications dans les catalogues pourraient être affectées
  warnApiKeys: Les clés d'API existantes ne seront plus valides
  warnProcessings: Les traitements associés pourraient être affectés
  cancel: Annuler
  confirm: Confirmer
en:
  changeOwnerTitle: Change owner
  changeOwnerWarning: "Warning, changing the owner may have the following consequences:"
  warnPermissions: Permissions will be reset
  warnApps: Applications using this resource may stop working
  warnPortals: Portal publications may be affected
  warnCatalogs: Catalog publications may be affected
  warnApiKeys: Existing API keys will no longer be valid
  warnProcessings: Associated processings may be affected
  cancel: Cancel
  confirm: Confirm
</i18n>

<script lang="ts" setup>
import { OwnerPick as ownerPick } from '@data-fair/lib-vuetify'

const props = defineProps<{
  resource: { id: string, owner: { type: string, id: string, name?: string, department?: string } }
  resourceType: 'datasets' | 'applications'
}>()

const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const router = useRouter()
const { $fetch } = useNuxtApp()

const dialog = ref(false)
const newOwner = ref<{ type: string, id: string, name?: string, department?: string } | null>(null)

watch(dialog, (val) => {
  if (val) newOwner.value = null
})

const confirm = async () => {
  if (!newOwner.value) return
  await $fetch(`/${props.resourceType}/${props.resource.id}/owner`, {
    method: 'PUT',
    body: newOwner.value
  })
  dialog.value = false
  emit('changed')
  router.push(`/${props.resourceType === 'datasets' ? 'dataset' : 'application'}/${props.resource.id}`)
}
</script>
```

- [ ] **Step 2: Wire into dataset-actions.vue**

Add to `ui/src/components/dataset/dataset-actions.vue`:
- Import `owner-change-dialog`
- Add list item before delete, guarded by `can('setOwner').value`
- Use activator slot pattern

```vue
<!-- Add before the delete v-list-item -->
<owner-change-dialog
  v-if="can('setOwner').value"
  :resource="dataset"
  resource-type="datasets"
  @changed="() => {}"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="warning">mdi-account-switch</v-icon>
      </template>
      <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
    </v-list-item>
  </template>
</owner-change-dialog>
```

Add i18n: `changeOwner: Changer le propriétaire` / `Change owner`

- [ ] **Step 3: Wire into application-actions.vue**

Same pattern but with `can('setOwner')` (no `.value` — application-store returns raw boolean):

```vue
<owner-change-dialog
  v-if="can('setOwner')"
  :resource="application"
  resource-type="applications"
  @changed="() => {}"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="warning">mdi-account-switch</v-icon>
      </template>
      <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
    </v-list-item>
  </template>
</owner-change-dialog>
```

- [ ] **Step 4: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to a dataset detail page → actions panel → verify "Change owner" appears for admin users
- Navigate to an application detail page → same verification
- Open dialog → verify owner-pick renders, warning appears on selection

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/common/owner-change-dialog.vue ui/src/components/dataset/dataset-actions.vue ui/src/components/application/application-actions.vue
git commit -m "feat: add owner change dialog for datasets and applications"
```

---

### Task 2: Integration Dialog

**Files:**
- Create: `ui/src/components/common/integration-dialog.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-integration-dialog.vue` and `ui-legacy/public/components/application/application-integration-dialog.vue`

- [ ] **Step 1: Create integration-dialog.vue**

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="900"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-card-title>{{ t('integrationTitle') }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="mode"
          :items="modes"
          :label="t('mode')"
          variant="outlined"
          density="compact"
          class="mb-4"
        />

        <v-checkbox
          v-if="mode === 'd-frame'"
          v-model="syncParams"
          :label="t('syncParams')"
          density="compact"
          hide-details
          class="mb-4"
        />

        <v-textarea
          :model-value="snippet"
          readonly
          variant="outlined"
          rows="4"
          class="code-snippet"
        />

        <v-btn
          color="primary"
          variant="text"
          size="small"
          class="mt-2"
          @click="copyToClipboard"
        >
          <v-icon start>
            mdi-content-copy
          </v-icon>
          {{ copied ? t('copied') : t('copy') }}
        </v-btn>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="dialog = false"
        >
          {{ t('close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  integrationTitle: Code d'intégration
  mode: Mode d'intégration
  iframe: iframe (simple)
  d-frame: d-frame (avancé)
  syncParams: Synchroniser les paramètres d'URL
  copy: Copier le code
  copied: Copié !
  close: Fermer
en:
  integrationTitle: Integration code
  mode: Integration mode
  iframe: iframe (simple)
  d-frame: d-frame (advanced)
  syncParams: Sync URL parameters
  copy: Copy code
  copied: Copied!
  close: Close
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string, slug?: string, href?: string, previews?: Array<{ id: string, href: string }> }
}>()

const { t } = useI18n()

const dialog = ref(false)
const mode = ref<'iframe' | 'd-frame'>('iframe')
const syncParams = ref(false)
const copied = ref(false)

const modes = computed(() => [
  { title: t('iframe'), value: 'iframe' },
  { title: t('d-frame'), value: 'd-frame' }
])

const embedUrl = computed(() => {
  if (props.resourceType === 'applications') {
    return props.resource.href || ''
  }
  // datasets: use first preview or default to table
  const preview = props.resource.previews?.[0]
  return preview?.href || ''
})

const snippet = computed(() => {
  if (mode.value === 'iframe') {
    return `<iframe src="${embedUrl.value}" width="100%" height="500px" style="border: none;"></iframe>`
  }
  const syncAttr = syncParams.value ? ` sync-params="*:${props.resource.id}"` : ''
  return `<script src="${window.location.origin}/data-fair/frame/d-frame.js"><\/script>\n<d-frame src="${embedUrl.value}"${syncAttr} height="500px"></d-frame>`
})

const copyToClipboard = async () => {
  await navigator.clipboard.writeText(snippet.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<style scoped>
.code-snippet :deep(textarea) {
  font-family: monospace;
  font-size: 0.85em;
}
</style>
```

- [ ] **Step 2: Wire into dataset-actions.vue**

Add after "Use API" item, guarded by `dataset.finalizedAt`:

```vue
<integration-dialog
  v-if="dataset.finalizedAt"
  :resource="dataset"
  resource-type="datasets"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-code-tags</v-icon>
      </template>
      <v-list-item-title>{{ t('integration') }}</v-list-item-title>
    </v-list-item>
  </template>
</integration-dialog>
```

Add i18n: `integration: Code d'intégration` / `Integration code`

- [ ] **Step 3: Wire into application-actions.vue**

Add after "Use API" item:

```vue
<integration-dialog
  :resource="application"
  resource-type="applications"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-code-tags</v-icon>
      </template>
      <v-list-item-title>{{ t('integration') }}</v-list-item-title>
    </v-list-item>
  </template>
</integration-dialog>
```

- [ ] **Step 4: Test manually**

Run: `npm --prefix ui run dev`
- Open dataset actions → "Integration code" → verify iframe/d-frame modes, copy button
- Open application actions → same verification

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/common/integration-dialog.vue ui/src/components/dataset/dataset-actions.vue ui/src/components/application/application-actions.vue
git commit -m "feat: add integration/embed code dialog for datasets and applications"
```

---

### Task 3: Application Slug Editing

**Files:**
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Slug edit pattern in `ui/src/components/dataset/dataset-info.vue`

- [ ] **Step 1: Add slug edit dialog to application-actions.vue**

Add state and method in script:

```typescript
const slugDialog = ref(false)
const newSlug = ref('')
const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/

const saveSlug = async () => {
  if (!newSlug.value.match(slugRegex)) return
  await $fetch(`/applications/${application.value!.id}`, {
    method: 'PATCH',
    body: { slug: newSlug.value }
  })
  slugDialog.value = false
}

watch(slugDialog, (val) => {
  if (val) newSlug.value = application.value?.slug || ''
})
```

Add template before delete item (guarded by `can('writeDescriptionBreaking')`):

```vue
<v-list-item
  v-if="can('writeDescriptionBreaking')"
  @click="slugDialog = true"
>
  <template #prepend>
    <v-icon color="primary">mdi-link-variant</v-icon>
  </template>
  <v-list-item-title>{{ t('editSlug') }}</v-list-item-title>
</v-list-item>

<!-- Add dialog after delete dialog -->
<v-dialog v-model="slugDialog" max-width="500">
  <v-card>
    <v-card-title>{{ t('editSlugTitle') }}</v-card-title>
    <v-card-text>
      <v-alert type="warning" variant="outlined" class="mb-4">
        {{ t('slugWarning') }}
      </v-alert>
      <v-text-field
        v-model="newSlug"
        :label="t('slug')"
        :rules="[v => !!v || t('required'), v => !!v?.match(slugRegex) || t('slugFormat')]"
        variant="outlined"
      />
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn variant="text" @click="slugDialog = false">{{ t('no') }}</v-btn>
      <v-btn color="primary" :disabled="!newSlug.match(slugRegex)" @click="saveSlug">{{ t('yes') }}</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

Add i18n entries:
```yaml
fr:
  editSlug: Modifier l'identifiant
  editSlugTitle: Modifier l'identifiant de l'application
  slugWarning: "Attention : modifier l'identifiant cassera les liens existants vers cette application."
  slug: Identifiant
  required: Requis
  slugFormat: "Format invalide (lettres minuscules, chiffres, tirets)"
en:
  editSlug: Edit slug
  editSlugTitle: Edit application slug
  slugWarning: "Warning: changing the slug will break existing links to this application."
  slug: Slug
  required: Required
  slugFormat: "Invalid format (lowercase letters, numbers, hyphens)"
```

- [ ] **Step 2: Add $fetch import**

The `application-actions.vue` currently uses `useApplicationStore()` which has a `$fetch`. Check if `$fetch` is available from the store or needs separate import. Use the same pattern as `dataset-actions.vue`.

- [ ] **Step 3: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to application detail → actions → "Edit slug" → verify dialog opens
- Enter invalid slug → verify validation error
- Enter valid slug → verify PATCH succeeds

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/application/application-actions.vue
git commit -m "feat: add slug editing to application actions"
```
