# Permissions Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the legacy permissions editor (Vue 2/Vuetify 2) to new UI (Vue 3/Vuetify 4) with strict feature parity for dataset and application pages.

**Architecture:** Three new components in `ui/src/components/permissions/` — `member-select.vue`, `permission-dialog.vue`, `permissions.vue` — each a direct port of their legacy counterpart. Dataset and application pages replace `<private-access>` with `<permissions>`. Test fixtures get partners on `test_org1`.

**Tech Stack:** Vue 3 Composition API (`<script lang="ts" setup>`), Vuetify 4, vue-i18n per-component `<i18n>` blocks, ofetch (`$fetch` from `~/context`), Playwright e2e tests.

**Spec:** `docs/superpowers/specs/2026-03-24-permissions-parity-design.md`

**Key references:**
- Legacy permissions: `ui-legacy/public/components/permissions.vue`
- Legacy dialog: `ui-legacy/public/components/permission-dialog.vue`
- Legacy member-select: `ui-legacy/public/components/member-select.vue`
- Legacy permissions-utils: `ui-legacy/public/assets/permissions-utils.js`
- Existing new UI editor (for coding patterns): `ui/src/components/permissions-editor.vue`
- Context/globals: `ui/src/context.ts` (`$sdUrl`, `$apiPath`, `$fetch`)
- Dataset store: `ui/src/composables/dataset-store.ts`
- Application store: `ui/src/composables/application-store.ts`
- Test fixtures: `tests/fixtures/login.ts`, `tests/support/axios.ts`, `tests/support/workers.ts`
- Org fixtures: `dev/resources/organizations.json`

**Coding conventions (match existing codebase):**
- `<script lang="ts" setup>` with auto-imported composables (`useI18n`, `useUiNotif`, `ref`, `computed`, `watch`, `onMounted`)
- `$fetch` for API calls — uses **relative paths** (ofetch has `baseURL = $apiPath`). E.g., `$fetch('datasets/xxx/permissions')` NOT `$fetch('/data-fair/api/v1/datasets/xxx/permissions')`. For external URLs (simple-directory), use native `fetch()`.
- MDI icons: import from `@mdi/js` (e.g., `import { mdiPencil, mdiDelete } from '@mdi/js'`) and bind with `:icon="mdiPencil"`. Do NOT use string-based `mdi-pencil`.
- Vuetify 4 props: `variant="outlined"`, `density="compact"`, `hide-details` (NOT the Vuetify 2 `outlined`, `dense`)
- `v-select` uses `title` (not `text`) for item labels in Vuetify 4. Use `title` consistently in all item objects (not `label`).
- For tables, use `<v-table>` (simple table), not `v-data-table`.

**Critical implementation notes:**
- The `permissions.vue` component fetches its own API doc lazily when detailed mode is toggled on. It does NOT receive `api` as a prop. This avoids the chicken-and-egg problem where the detailed mode toggle is gated by `api` availability.
- `$fetch` uses relative paths: `$fetch(\`${props.resourceType}/${props.resource.id}/permissions\`)` — same pattern as `permissions-editor.vue`.
- `v-select` item disabled state uses `props: { disabled: true }` in Vuetify 4.

---

### Task 1: Add partners to test_org1 fixture

**Files:**
- Modify: `dev/resources/organizations.json`

- [ ] **Step 1: Add partners array to test_org1**

In `dev/resources/organizations.json`, add the `partners` field to the `test_org1` object (after the `departments` field, before `members`):

```json
"partners": [{
  "id": "test_org2",
  "name": "Test Org 2"
}, {
  "id": "test_org3",
  "name": "Test Org 3"
}],
```

- [ ] **Step 2: Commit**

```bash
git add dev/resources/organizations.json
git commit -m "test: add partners to test_org1 for permissions e2e tests"
```

---

### Task 2: Create member-select.vue component

**Files:**
- Create: `ui/src/components/permissions/member-select.vue`

**Reference:** `ui-legacy/public/components/member-select.vue`

This is the simplest component — no dependencies on other new components. Port from Vue 2 Options API to Vue 3 Composition API with Vuetify 4.

- [ ] **Step 1: Create the component**

Create `ui/src/components/permissions/member-select.vue`:

```vue
<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="filledMembers"
    :loading="loading"
    item-title="name"
    item-value="id"
    :label="t('member', {org: organization.name})"
    :no-filter="true"
    required
    return-object
    clearable
    @update:model-value="$emit('update:modelValue', $event)"
    @update:search="onSearch"
  >
    <template #item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #subtitle>
          {{ item.raw.email }}
          <span v-if="item.raw.role"> - {{ item.raw.role }}</span>
          <span v-if="item.raw.department"> - {{ item.raw.departmentName || item.raw.department }}</span>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  member: Membre de {org}
en:
  member: Member of {org}
</i18n>

<script lang="ts" setup>
import { $sdUrl } from '~/context'

const props = defineProps<{
  modelValue: { id: string, name: string, email?: string } | null
  organization: { id: string, name: string }
}>()

defineEmits<{
  'update:modelValue': [value: any]
}>()

const { t } = useI18n()

const members = ref<any[]>([])
const loading = ref(false)

const filledMembers = computed(() => {
  const result: any[] = []
  if (props.modelValue?.id) {
    result.push(props.modelValue)
  }
  return result.concat(members.value)
})

async function onSearch (search: string) {
  if (search && props.modelValue && search === props.modelValue.name) return
  loading.value = true
  if (search && search.length >= 3) {
    const res = await fetch(`${$sdUrl}/api/organizations/${props.organization.id}/members?q=${encodeURIComponent(search)}`)
    const data = await res.json()
    members.value = data.results
  } else {
    members.value = []
  }
  loading.value = false
}
</script>
```

- [ ] **Step 2: Verify lint passes**

```bash
npm -w ui run lint
```

Expected: no errors (warnings about v-html in other files are ok)

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/permissions/member-select.vue
git commit -m "feat: add member-select component for permissions editor"
```

---

### Task 3: Create permission-dialog.vue component

**Files:**
- Create: `ui/src/components/permissions/permission-dialog.vue`

**Reference:** `ui-legacy/public/components/permission-dialog.vue`

Port from Vue 2 Options API to Vue 3 Composition API. Key changes from legacy:
- `v-model` instead of `value`/`@input`
- `$set`/`$delete` → direct property assignment (Vue 3 reactivity handles it)
- `item-text` → `item-title` (Vuetify 4)
- `text` prop on button → `variant="text"`
- Dialog activator pattern changes in Vuetify 4

- [ ] **Step 1: Create the component**

Create `ui/src/components/permissions/permission-dialog.vue`:

```vue
<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
    persistent
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card
      v-if="permission && showDialog"
      variant="outlined"
    >
      <v-card-title>{{ t('editPermission') }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="permission.type"
          :items="permissionTypes"
          item-value="value"
          :label="t('scope')"
          required
          @update:model-value="setPermissionType"
        />

        <template v-if="permission.type === 'organization'">
          <v-select
            v-model="orgSelectType"
            :items="orgSelectTypes"
          />

          <template v-if="orgSelectType === 'ownerOrg'">
            <v-select
              v-if="owner.departments && owner.departments.length"
              v-model="permission.department"
              :items="[{value: null, title: t('allDeps')}, ...owner.departments.map((d: any) => ({value: d.id, title: `${d.name} (${d.id})`})), {value: '-', title: t('noDep')}]"
              :label="t('department')"
            />

            <v-select
              v-if="owner.roles && owner.roles.length"
              v-model="permission.roles"
              :items="owner.roles"
              :label="t('rolesLabel')"
              multiple
            />
          </template>

          <template v-if="orgSelectType === 'partner'">
            <v-select
              v-model="partner"
              :items="owner.partners || []"
              item-title="name"
              item-value="id"
              return-object
              :label="t('partner')"
            />
          </template>
        </template>

        <template v-if="permission.type === 'user'">
          <v-select
            v-model="userSelectType"
            :items="userSelectTypes"
          />
          <member-select
            v-if="userSelectType === 'member'"
            :model-value="member"
            :organization="owner"
            @update:model-value="onMemberChange"
          />
          <v-text-field
            v-if="userSelectType === 'email'"
            v-model="permission.email"
            :label="t('email')"
          />
        </template>

        <v-select
          v-model="permission.classes"
          :items="classItems"
          item-title="title"
          item-value="class"
          :label="t('actions')"
          multiple
        />

        <v-switch
          v-model="expertMode"
          color="primary"
          :label="t('expertMode')"
        />

        <v-select
          v-if="expertMode"
          v-model="permission.operations"
          :items="operationItems"
          item-title="title"
          item-value="id"
          :label="t('detailedActions')"
          multiple
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :disabled="!valid"
          color="primary"
          @click="emitAndClose"
        >
          {{ t('validate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  editPermission: Éditer des permissions
  public: Public
  organization: Organisation
  user: Utilisateur
  rolesLabel: Rôles (tous si aucun coché)
  validate: Valider
  cancel: Annuler
  scope: Portée
  detailedActions: Actions détaillées
  expertMode: Mode expert
  actions: Actions
  department: Département
  allDeps: Tous les départements
  noDep: Aucun département (organisation principale seulement)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
  amongPartners: Parmi les organisations partenaires
  partner: Partenaire
  ownerOrg: Organisation propriétaire
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    use: Utiliser le service
en:
  editPermission: Edit permissions
  public: Public
  organization: Organization
  user: User
  rolesLabel: Roles (all if none is selected)
  validate: Validate
  cancel: Cancel
  scope: Scope
  detailedActions: Detailed actions
  expertMode: Expert mode
  actions: Actions
  department: Department
  allDeps: All departments
  noDep: No department (main organization only)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designated by their email
  email: Email
  amongPartners: Among partner organizations
  partner: Partner
  ownerOrg: Owner organization
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    use: Use the service
</i18n>

<script lang="ts" setup>
import MemberSelect from './member-select.vue'

const props = defineProps<{
  modelValue?: any
  permissionClasses: Record<string, { id: string, title: string, class: string }[]>
  owner: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const { t, te } = useI18n()

const showDialog = ref(false)
const permission = ref<any>(null)
const expertMode = ref(false)

// --- Restricted permission classes (public scope can only use read/list/use) ---
const restrictedPermissionClasses = computed(() => {
  if (permission.value && !permission.value.type) {
    return ['read', 'list', 'use']
      .reduce((classes: any, c: string) => { if (props.permissionClasses[c]) classes[c] = props.permissionClasses[c]; return classes }, {})
  }
  return props.permissionClasses
})

// --- Class items for the v-select ---
const classItems = computed(() => {
  return Object.keys(restrictedPermissionClasses.value)
    .filter(c => te('classNames.' + c))
    .map(c => ({ class: c, title: t('classNames.' + c) }))
})

// --- Operation items with group headers ---
const operationItems = computed(() => {
  const items: any[] = []
  for (const c of Object.keys(restrictedPermissionClasses.value).filter(c => te('classNames.' + c))) {
    items.push({ title: t('classNames.' + c), value: c, props: { disabled: true } })
    items.push(...restrictedPermissionClasses.value[c])
  }
  return items
})

// --- Permission types ---
const permissionTypes = computed(() => {
  const types: { value: any, title: string }[] = [
    { value: null, title: t('public') },
    { value: 'user', title: t('user') }
  ]
  if (props.owner.type === 'organization') {
    types.push({ value: 'organization', title: t('organization') })
  }
  return types
})

// --- User select type ---
const userSelectTypes = computed(() => {
  const types: { value: string, title: string }[] = [
    { value: '*', title: t('allUsers') }
  ]
  if (props.owner.type === 'organization') {
    types.push({ value: 'member', title: t('memberOf', { org: props.owner.name }) })
  }
  types.push({ value: 'email', title: t('userByEmail') })
  return types
})

const userSelectType = computed({
  get () {
    if (!permission.value) return null
    if (permission.value.id === '*') return '*'
    if (![null, undefined].includes(permission.value.email) && !permission.value.id) return 'email'
    if (props.owner.type === 'organization') {
      if (permission.value.email && permission.value.id) return 'member'
      if (!permission.value.id) return 'member'
      return null
    }
    return 'email'
  },
  set (v) {
    if (!permission.value) return
    if (v === '*') {
      permission.value.id = '*'
      delete permission.value.name
      delete permission.value.email
    } else if (v === 'email') {
      delete permission.value.id
      delete permission.value.name
      permission.value.email = ''
    } else if (v === 'member') {
      permission.value.id = null
      permission.value.name = null
      permission.value.email = null
    }
  }
})

// --- Org select type ---
const orgSelectTypes = computed(() => [
  { value: 'ownerOrg', title: t('ownerOrg') },
  { value: 'partner', title: t('amongPartners') }
])

const orgSelectType = computed({
  get () {
    if (!permission.value || permission.value.type !== 'organization') return null
    if (permission.value.id === props.owner.id) return 'ownerOrg'
    return 'partner'
  },
  set (v) {
    if (!permission.value) return
    delete permission.value.email
    permission.value.department = null
    permission.value.roles = []
    if (v === 'ownerOrg') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    } else if (v === 'partner') {
      permission.value.id = null
      permission.value.name = null
    }
  }
})

// --- Partner ---
const partner = computed({
  get () {
    if (orgSelectType.value !== 'partner') return null
    if (!permission.value?.id) return null
    return props.owner.partners?.find((p: any) => p.id === permission.value.id) || null
  },
  set (org: any) {
    if (!permission.value) return
    delete permission.value.email
    if (org) {
      permission.value.id = org.id
      permission.value.name = org.name
    } else {
      permission.value.id = null
      permission.value.name = null
    }
  }
})

// --- Member ---
const member = computed(() => {
  if (!permission.value || permission.value.type !== 'user' || !permission.value.id) return null
  return { id: permission.value.id, name: permission.value.name, email: permission.value.email }
})

function onMemberChange (user: any) {
  if (!permission.value) return
  delete permission.value.department
  delete permission.value.roles
  if (user) {
    permission.value.id = user.id
    permission.value.name = user.name
    permission.value.email = user.email
  } else {
    permission.value.id = null
    permission.value.name = null
    permission.value.email = null
  }
}

// --- Validation ---
const valid = computed(() => {
  if (!permission.value) return false
  if ((!permission.value.operations || !permission.value.operations.length) && (!permission.value.classes || !permission.value.classes.length)) return false
  if (permission.value.type === 'organization' && !permission.value.id) return false
  if (permission.value.type === 'organization' && props.owner.type === 'organization' && permission.value.id === props.owner.id && !((permission.value.roles && permission.value.roles.length) || permission.value.department)) return false
  if (permission.value.type === 'user' && !(permission.value.id || permission.value.email)) return false
  return true
})

// --- Init on dialog open ---
function init () {
  if (!showDialog.value) {
    permission.value = null
    return
  }
  if (props.modelValue) {
    permission.value = JSON.parse(JSON.stringify(props.modelValue))
    if (permission.value.operations && permission.value.operations.length) expertMode.value = true
    permission.value.type = permission.value.type || null
    permission.value.id = permission.value.id || null
    permission.value.department = permission.value.department || null
  } else {
    permission.value = {
      type: props.owner.type === 'organization' ? 'organization' : null,
      operations: [],
      classes: ['read', 'list']
    }
    if (props.owner.type === 'organization') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    }
    expertMode.value = false
  }
}

watch(showDialog, init)

// --- Auto-validation: list → read, list op → readDescription ---
watch(() => permission.value?.classes, (classes) => {
  if (classes && classes.includes('list') && !classes.includes('read')) {
    classes.push('read')
  }
}, { deep: true })

watch(() => permission.value?.operations, (operations) => {
  if (operations && operations.includes('list') && !operations.includes('readDescription')) {
    operations.push('readDescription')
  }
}, { deep: true })

// --- Strip invalid classes when scope changes ---
watch(restrictedPermissionClasses, () => {
  if (permission.value?.classes?.length) {
    permission.value.classes = permission.value.classes.filter((c: string) => !!restrictedPermissionClasses.value[c])
  }
})

// --- Scope type change handler ---
function setPermissionType () {
  if (!permission.value) return
  if (permission.value.type === 'organization') {
    if (props.owner.type === 'organization') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    } else {
      permission.value.id = null
      permission.value.name = null
    }
    permission.value.department = null
    permission.value.roles = []
  } else if (permission.value.type === 'user') {
    permission.value.id = null
    permission.value.name = null
    permission.value.email = null
    delete permission.value.department
    delete permission.value.roles
  } else if (permission.value.type === null) {
    delete permission.value.department
    delete permission.value.roles
    delete permission.value.name
    delete permission.value.email
    delete permission.value.id
  }
}

function emitAndClose () {
  emit('update:modelValue', permission.value)
  showDialog.value = false
}
</script>
```

- [ ] **Step 2: Verify lint passes**

```bash
npm -w ui run lint
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/permissions/permission-dialog.vue
git commit -m "feat: add permission-dialog component for detailed permissions editing"
```

---

### Task 4: Create permissions.vue main component

**Files:**
- Create: `ui/src/components/permissions/permissions.vue`

**Reference:** `ui-legacy/public/components/permissions.vue`

This is the main component that orchestrates visibility, contrib profiles, detailed mode, and the permissions table. Port from Vue 2 Options API to Vue 3 Composition API.

- [ ] **Step 1: Create the component**

Create `ui/src/components/permissions/permissions.vue`:

```vue
<template>
  <div>
    <p>{{ t('description') }}</p>

    <v-alert
      v-if="resource.owner?.department"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      <a
        href="https://data-fair.github.io/3/user-guide-backoffice/department"
        target="_blank"
      >{{ t('readDepPermissionsDoc') }}</a>
    </v-alert>

    <v-progress-linear
      v-if="!permissions"
      indeterminate
    />
    <template v-else>
      <v-alert
        v-if="hasPrivateParents && !isPublic"
        type="warning"
        variant="outlined"
        density="compact"
        class="mb-3"
      >
        {{ t('warningPublicApp') }}
      </v-alert>
      <v-alert
        v-if="hasPublicDeps && isPublic"
        type="warning"
        variant="outlined"
        density="compact"
        class="mb-3"
      >
        {{ t('warningPrivateDataset') }}
      </v-alert>

      <v-select
        v-model="visibility"
        :disabled="disabled"
        :items="visibilityItems"
        :label="t('visibilityLabel')"
        variant="outlined"
        density="compact"
        style="max-width: 800px;"
        hide-details
      />

      <v-select
        v-if="resource.owner?.type === 'organization'"
        v-model="contribProfile"
        :disabled="disabled"
        :items="contribProfileItems"
        :label="t('contribProfileLabel')"
        variant="outlined"
        density="compact"
        style="max-width: 800px;"
        hide-details
        class="mt-4"
      />

      <v-switch
        v-if="resource.rest && resource.rest.lineOwnership"
        v-model="allUsersManageOwnLines"
        :disabled="disabled"
        color="primary"
        :label="t('allUsersManageOwnLines')"
        hide-details
      />

      <v-switch
        v-model="detailedMode"
        color="primary"
        :label="t('detailedMode')"
      />
    </template>

    <template v-if="detailedMode && ownerDetails && api"
>
      <permission-dialog
        v-if="!disabled"
        :permission-classes="permissionClasses"
        :owner="ownerDetails"
        @update:model-value="onAddPermission"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            color="primary"
            v-bind="activatorProps"
          >
            {{ t('addPermission') }}
          </v-btn>
        </template>
      </permission-dialog>

      <v-table
        v-if="permissions && permissions.length"
        class="elevation-1 mt-3"
      >
        <thead>
          <tr>
            <th>{{ t('scope') }}</th>
            <th>{{ t('actions') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in permissions"
            :key="index"
          >
            <td>
              <div v-if="!item.type">
                {{ t('public') }}
              </div>
              <div v-if="item.type === 'user'">
                {{ t('userName', {name: item.name || item.id || item.email}) }}
              </div>
              <div v-if="item.type === 'organization' && !item.department">
                {{ t('organizationName', {name: item.name}) }}
              </div>
              <div v-if="item.type === 'organization' && item.department && item.department !== '-'">
                {{ t('organizationName', {name: item.name + ' / ' + item.department}) }}
              </div>
              <div v-if="item.type === 'organization' && item.department === '-'">
                {{ t('organizationName', {name: item.name + ' / ' + t('noDep')}) }}
              </div>
              <div v-if="item.type === 'organization' && (!item.roles || !item.roles.length)">
                {{ t('allRoles') }}
              </div>
              <div v-if="item.type === 'organization' && item.roles && item.roles.length">
                {{ t('restrictedRoles', {roles: item.roles.join(', ')}) }}
              </div>
            </td>
            <td>
              <template v-for="(classOperations, permClass) in permissionClasses">
                <div
                  v-if="(item.classes || []).includes(permClass as string) || classOperations.filter((o: any) => (item.operations || []).includes(o.id)).length"
                  :key="permClass as string"
                  class="text-body-2"
                >
                  {{ t('classNames.' + permClass) }}
                  <template v-if="!(item.classes || []).includes(permClass as string)">
                    ({{ classOperations.filter((o: any) => (item.operations || []).find((oid: string) => o.id && o.id === oid)).map((o: any) => o.title.toLowerCase().replace('.', '')).join(' - ') }})
                  </template>
                </div>
              </template>
            </td>
            <td class="text-right" style="white-space: nowrap;">
              <permission-dialog
                v-if="!disabled"
                :model-value="item"
                :permission-classes="permissionClasses"
                :owner="ownerDetails"
                @update:model-value="p => onEditPermission(index, p)"
              >
                <template #activator="{ props: activatorProps }">
                  <v-btn
                    color="primary"
                    v-bind="activatorProps"
                    icon
                    size="small"
                  >
                    <v-icon :icon="mdiPencil" />
                  </v-btn>
                </template>
              </permission-dialog>
              <v-btn
                v-if="!disabled"
                icon
                size="small"
                color="warning"
                @click="onDeletePermission(index)"
              >
                <v-icon :icon="mdiDelete" />
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  description: Permettez à d'autres utilisateurs d'utiliser cette ressource.
  visibilityLabel: Qui peut consulter cette ressource ?
  visibility:
    public: tout le monde
    privateOrg: uniquement les administrateurs de l'organisation {org}
    privateOrgContrib: les administrateurs et contributeurs de l'organisation {org}
    privateUser: uniquement l'utilisateur {user}
    sharedInOrg: tous les utilisateurs de l'organisation {org}
  contribProfileLabel: Qui peut contribuer à cette ressource ?
  contribProfile:
    adminOnly: uniquement les administrateurs de l'organisation {org}
    contribWriteData: les contributeurs de l'organisation {org} peuvent modifier uniquement les données et seulement si elles sont compatibles
    contribWriteNoBreaking: les contributeurs de l'organisation {org} peuvent tout modifier à l'exception de ce qui risquerait de provoquer une rupture de compatibilité
    contribWriteAll: les contributeurs de l'organisation {org} peuvent tout modifier et supprimer la ressource
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des applications publiques.
  warningPublicApp: Vous ne devriez pas rendre cette application publique, elle utilise des sources de données privées.
  addPermission: Ajouter des permissions
  public: Public
  organization: Organisation
  user: Utilisateur
  organizationName: Organisation {name}
  userName: Utilisateur {name}
  allRoles: Tous les rôles
  restrictedRoles: 'Restreint aux rôles : {roles}'
  scope: Portée
  detailedMode: Édition détaillée des permissions
  actions: Actions
  permissionsUpdated: Les permissions ont été mises à jour
  noDep: aucun département
  readDepPermissionsDoc: Consultez la documentation sur les départements pour comprendre les permissions des différents membres du département.
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
  allUsersManageOwnLines: Permettre à tous les utilisateurs externes de gérer leurs propres lignes à l'intérieur de ce jeu de données (usages crowd-sourcing avancés).
en:
  description: Allow other users to use this resource.
  visibilityLabel: Who can read this resource?
  visibility:
    public: anyone
    privateOrg: only admins of the organization {org}
    privateOrgContrib: admins and contributors of the organization {org}
    privateUser: only yourself
    sharedInOrg: any user of the organization {org}
  contribProfileLabel: Who can contribute to this resource?
  contribProfile:
    adminOnly: only admins of the organization {org}
    contribWriteData: contribs of the organization {org} can update only the data and only if it is compatible
    contribWriteNoBreaking: contribs of the organization {org} can update anything except for what might constitute a breaking change
    contribWriteAll: contribs of the organization {org} can update anything and delete the resource
  warningPrivateDataset: You should not make this dataset private as long as it is used in public applications.
  warningPublicApp: You should not make this application public as long as it uses private datasets.
  addPermission: Add permissions
  public: Public
  organization: Organization
  user: User
  organizationName: Organization {name}
  userName: User {name}
  allRoles: All roles
  restrictedRoles: 'Restricted to roles: {roles}'
  scope: Scope
  detailedMode: Detailed edition of permissions
  actions: Actions
  permissionsUpdated: Permissions were updated
  noDep: no department
  readDepPermissionsDoc: Read the documentation about departments to understand the permissions applied to members of the department and of the organization.
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
  allUsersManageOwnLines: Allow all external users to manage their own lines inside the dataset (advanced crowd-sourcing use-cases).
</i18n>

<script lang="ts" setup>
import { $sdUrl, $apiPath } from '~/context'
import { mdiPencil, mdiDelete } from '@mdi/js'
import PermissionDialog from './permission-dialog.vue'

const props = defineProps<{
  resource: any
  resourceType: 'datasets' | 'applications'
  disabled: boolean
  hasPublicDeps?: boolean
  hasPrivateParents?: boolean
}>()

const emit = defineEmits<{
  permissions: [value: any[]]
}>()

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()

const permissions = ref<any[] | null>(null)
const detailedMode = ref(false)
const ownerDetails = ref<any>(null)
const api = ref<any>(null)

// --- Permission class map from API doc ---
const permissionClasses = computed(() => {
  const classes: Record<string, { id: string, title: string, class: string }[]> = {
    list: [{ id: 'list', title: 'Lister la ressource', class: 'list' }]
  }
  if (api.value) {
    Object.keys(api.value.paths).forEach(path => Object.keys(api.value.paths[path]).forEach(method => {
      const permClass = api.value.paths[path][method]['x-permissionClass']
      if (!permClass) return
      classes[permClass] = (classes[permClass] || []).concat({
        id: api.value.paths[path][method].operationId,
        title: api.value.paths[path][method].summary,
        class: permClass
      })
      for (const altPermission of api.value.paths[path][method]['x-altPermissions'] || []) {
        classes[permClass] = (classes[permClass] || []).concat([altPermission])
      }
    }))
  }
  return classes
})

// --- Permission type checkers (exact semantics from legacy) ---
const isInDepartmentPermission = (p: any) =>
  !p.department || (!props.resource.owner?.department && p.department === '-') || p.department === props.resource.owner?.department

const isPublicPermission = (p: any) =>
  !p.type && p.classes?.includes('read') && p.classes?.includes('list')

const isSharedInOrgPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && !p.department &&
  p.classes?.includes('read') && p.classes?.includes('list') && !p.roles

const isPrivateOrgContribPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
  p.classes?.includes('read') && p.classes?.includes('list') && p.roles?.includes('contrib')

const isManageOwnLinesPermission = (p: any) =>
  p.type === 'user' && p.id === '*' && p.classes?.includes('manageOwnLines')

const isContribWriteAllPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
  p.roles?.length === 1 && p.roles[0] === 'contrib' &&
  p.classes?.includes('write') && p.operations?.includes('delete')

const isContribWriteDataPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
  p.roles?.length === 1 && p.roles[0] === 'contrib' &&
  p.operations?.includes(props.resource.isRest ? 'createLine' : 'writeData') &&
  !p.operations?.includes('writeDescription')

const isContribWriteNoBreakingPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
  p.roles?.length === 1 && p.roles[0] === 'contrib' &&
  p.operations?.includes('writeDescription') && !p.operations?.includes('writeDescriptionBreaking')

const hasDetailedPermission = computed(() => {
  if (!permissions.value) return false
  return !!permissions.value.find(p =>
    !isPublicPermission(p) &&
    !isSharedInOrgPermission(p) &&
    !isPrivateOrgContribPermission(p) &&
    !isManageOwnLinesPermission(p) &&
    !isContribWriteDataPermission(p) &&
    !isContribWriteNoBreakingPermission(p) &&
    !isContribWriteAllPermission(p)
  )
})

// --- Computed booleans ---
const isPublic = computed(() => !!permissions.value?.find(isPublicPermission))

const orgName = computed(() => props.resource.owner?.name || props.resource.owner?.id || '')

// --- Visibility ---
const visibility = computed({
  get () {
    if (!permissions.value) return undefined
    if (permissions.value.find(isPublicPermission)) return 'public'
    if (permissions.value.find(isSharedInOrgPermission)) return 'sharedInOrg'
    if (permissions.value.find(isPrivateOrgContribPermission)) return 'privateOrgContrib'
    if (props.resource.owner?.type === 'organization') return 'privateOrg'
    return 'privateUser'
  },
  set (v) {
    if (!permissions.value) return
    permissions.value = permissions.value
      .filter(p => !isPublicPermission(p) && !isSharedInOrgPermission(p) && !isPrivateOrgContribPermission(p))

    if (v === 'privateUser' || v === 'privateOrg') {
      // nothing to add
    } else {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, name: props.resource.owner.name, roles: ['contrib'], operations: [], classes: ['list', 'read', 'readAdvanced'] })
      if (v === 'sharedInOrg') {
        permissions.value.push({ type: 'organization', id: props.resource.owner.id, name: props.resource.owner.name, operations: [], classes: ['list', 'read'] })
      } else if (v === 'public') {
        permissions.value.push({ operations: [], classes: ['list', 'read'] })
      }
    }
    save()
  }
})

const visibilityItems = computed(() => {
  const items: any[] = []
  const privateDisabled = !!(props.hasPublicDeps && isPublic.value)
  if (props.resource.owner?.type === 'organization') {
    items.push({ value: 'privateOrg', title: t('visibility.privateOrg', { org: orgName.value }), props: { disabled: privateDisabled } })
    items.push({ value: 'privateOrgContrib', title: t('visibility.privateOrgContrib', { org: orgName.value }), props: { disabled: privateDisabled } })
    items.push({ value: 'sharedInOrg', title: t('visibility.sharedInOrg', { org: orgName.value }), props: { disabled: privateDisabled } })
  } else {
    items.push({ value: 'privateUser', title: t('visibility.privateUser', { user: orgName.value }), props: { disabled: privateDisabled } })
  }
  items.push({ value: 'public', title: t('visibility.public'), props: { disabled: !!(props.hasPrivateParents && !isPublic.value) } })
  return items
})

// --- Contrib profile ---
const contribProfile = computed({
  get () {
    if (!permissions.value) return undefined
    if (permissions.value.find(isContribWriteAllPermission)) return 'contribWriteAll'
    if (permissions.value.find(isContribWriteNoBreakingPermission)) return 'contribWriteNoBreaking'
    if (permissions.value.find(isContribWriteDataPermission)) return 'contribWriteData'
    return 'adminOnly'
  },
  set (v) {
    if (!permissions.value) return
    permissions.value = permissions.value
      .filter(p => !isContribWriteAllPermission(p) && !isContribWriteDataPermission(p) && !isContribWriteNoBreakingPermission(p))

    const dep = props.resource.owner?.department || '-'
    const writeDataOps = props.resource.isRest
      ? ['createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines']
      : ['writeData', 'cancelDraft']

    if (v === 'contribWriteData') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: props.resource.owner.name, roles: ['contrib'], operations: writeDataOps, classes: [] })
    } else if (v === 'contribWriteNoBreaking') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: props.resource.owner.name, roles: ['contrib'], operations: [...writeDataOps, 'writeDescription', 'postMetadataAttachment', 'deleteMetadataAttachment'], classes: [] })
    } else if (v === 'contribWriteAll') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: props.resource.owner.name, roles: ['contrib'], operations: ['delete'], classes: ['write'] })
    }
    save()
  }
})

const contribProfileItems = computed(() => {
  const items = [
    { value: 'adminOnly', title: t('contribProfile.adminOnly', { org: orgName.value }) }
  ]
  if (props.resource.isRest || props.resource.file) {
    items.push({ value: 'contribWriteData', title: t('contribProfile.contribWriteData', { org: orgName.value }) })
  }
  if (props.resource.isRest || props.resource.isVirtual || props.resource.file) {
    items.push({ value: 'contribWriteNoBreaking', title: t('contribProfile.contribWriteNoBreaking', { org: orgName.value }) })
  }
  items.push({ value: 'contribWriteAll', title: t('contribProfile.contribWriteAll', { org: orgName.value }) })
  return items
})

// --- Manage own lines ---
const allUsersManageOwnLines = computed({
  get () {
    return !!permissions.value?.find(isManageOwnLinesPermission)
  },
  set (v) {
    if (!permissions.value) return
    permissions.value = permissions.value.filter(p => !isManageOwnLinesPermission(p))
    if (v) permissions.value.push({ type: 'user', id: '*', operations: ['readSafeSchema'], classes: ['manageOwnLines'] })
    save()
  }
})

// --- Fetch permissions on mount ---
onMounted(async () => {
  const perms = await $fetch<any[]>(`${props.resourceType}/${props.resource.id}/permissions`)
  perms.forEach(p => { if (!p.type) p.type = null })
  permissions.value = perms
  emit('permissions', perms)
  detailedMode.value = hasDetailedPermission.value
})

// --- Fetch owner details and API doc when detailed mode is activated ---
watch(detailedMode, async () => {
  if (detailedMode.value && !ownerDetails.value) {
    const details = await fetch(`${$sdUrl}/api/${props.resource.owner.type}s/${props.resource.owner.id}`).then(r => r.json())
    ownerDetails.value = { ...details, type: props.resource.owner.type }
    if (ownerDetails.value.departments) {
      ownerDetails.value.departments.sort((d1: any, d2: any) => d1.name.localeCompare(d2.name))
    }
  }
  if (detailedMode.value && !api.value) {
    const apiDocPath = props.resourceType === 'datasets'
      ? `datasets/${props.resource.id}/private-api-docs.json`
      : `applications/${props.resource.id}/api-docs.json`
    api.value = await $fetch(apiDocPath)
  }
})

// --- Save ---
async function save () {
  if (!permissions.value) return
  const clean = JSON.parse(JSON.stringify(permissions.value))
  clean.forEach((p: any) => {
    if (!p.type) delete p.type
    if (!p.id) delete p.id
    if (!p.department) delete p.department
  })
  await $fetch(`${props.resourceType}/${props.resource.id}/permissions`, { method: 'PUT', body: clean })
  emit('permissions', permissions.value)
  sendUiNotif({ type: 'success', msg: t('permissionsUpdated') })
}

// --- Table actions ---
function onAddPermission (p: any) {
  if (!permissions.value) return
  permissions.value.push(p)
  save()
}

function onEditPermission (index: number, p: any) {
  if (!permissions.value) return
  permissions.value[index] = p
  save()
}

function onDeletePermission (index: number) {
  if (!permissions.value) return
  permissions.value.splice(index, 1)
  save()
}
</script>
```

- [ ] **Step 2: Verify lint passes**

```bash
npm -w ui run lint
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/permissions/permissions.vue
git commit -m "feat: add full permissions editor component with feature parity"
```

---

### Task 5: Integrate permissions component in dataset page

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue` (around lines 224-227)

Replace the `<private-access>` usage in the Share > Permissions tab with the new `<permissions>` component.

- [ ] **Step 1: Read the current dataset page file to get exact context**

Read `ui/src/pages/dataset/[id]/index.vue` fully, focusing on:
- The script section (to understand available refs/composables)
- The share section template (around line 224)
- Imports

- [ ] **Step 2: Add import and data**

In the `<script>` section, add:
- Import the `Permissions` component: `import Permissions from '~/components/permissions/permissions.vue'`
- Destructure `applicationsFetch` from the dataset store if not already present (needed for `hasPublicDeps`)
- Add a `hasPublicDeps` computed:

```typescript
import Permissions from '~/components/permissions/permissions.vue'

// Ensure applicationsFetch is destructured from store:
const { ..., applicationsFetch } = store

// Compute hasPublicDeps (are any apps using this dataset public?)
const hasPublicDeps = computed(() => {
  const apps = applicationsFetch.data.value?.results
  if (!apps) return false
  return apps.some((app: any) => app.visibility === 'public')
})
```

- [ ] **Step 3: Replace template**

Replace:
```html
<private-access v-model="dataset" />
```
With:
```html
<permissions
  v-if="dataset"
  :resource="dataset"
  resource-type="datasets"
  :disabled="!can('setPermissions').value"
  :has-public-deps="hasPublicDeps"
/>
```

- [ ] **Step 4: Verify lint passes**

```bash
npm -w ui run lint
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: integrate full permissions editor in dataset page"
```

---

### Task 6: Integrate permissions component in application page

**Files:**
- Modify: `ui/src/pages/application/[id]/index.vue` (around lines 239-243)

Same pattern as dataset page.

- [ ] **Step 1: Read the current application page to get exact context**

Read `ui/src/pages/application/[id]/index.vue` fully.

- [ ] **Step 2: Add import and data**

Add to `<script>`:
```typescript
import Permissions from '~/components/permissions/permissions.vue'

// Ensure datasetsFetch is available from application store:
// const { ..., datasetsFetch } = store

// Compute hasPrivateParents (does the app use private datasets?)
const hasPrivateParents = computed(() => {
  const datasets = datasetsFetch.data.value?.results
  if (!datasets) return false
  return datasets.some((ds: any) => ds.visibility !== 'public')
})
```

- [ ] **Step 3: Replace template**

Replace:
```html
<private-access v-model="application" />
```
With:
```html
<permissions
  v-if="application"
  :resource="application"
  resource-type="applications"
  :disabled="!can('setPermissions')"
  :has-private-parents="hasPrivateParents"
/>
```

- [ ] **Step 4: Verify lint passes**

```bash
npm -w ui run lint
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/application/[id]/index.vue
git commit -m "feat: integrate full permissions editor in application page"
```

---

### Task 7: Manual smoke test

Before writing e2e tests, do a manual check to catch obvious issues.

- [ ] **Step 1: Start the dev environment**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to a dataset page as test_user1 in test_org1 context**

Open browser, login, navigate to a dataset owned by test_org1. Check:
- Visibility dropdown renders with correct options
- Contrib profile dropdown renders (org-owned)
- Changing visibility saves (check network tab)
- "Édition détaillée" toggle appears when api is loaded

- [ ] **Step 3: Test detailed mode**

Enable detailed mode:
- Table should appear
- "Ajouter des permissions" button should appear
- Click add → dialog opens
- Select scope, fill fields, validate → new row

- [ ] **Step 4: Fix any issues found**

If any Vuetify 4 API mismatches or runtime errors, fix them now before proceeding to e2e tests.

- [ ] **Step 5: Commit fixes if any**

```bash
git add -u
git commit -m "fix: address smoke test issues in permissions components"
```

---

### Task 8: Write e2e tests — visibility and contrib profiles

**Files:**
- Create: `tests/features/ui/permissions.e2e.spec.ts`

This task creates the test file with setup and the first two test groups (visibility + contrib profiles).

- [ ] **Step 1: Create the test file with setup and visibility tests**

Create `tests/features/ui/permissions.e2e.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/login.ts'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('permissions editor', () => {
  let datasetId: string

  test.beforeEach(async () => {
    await clean()
    // Create a file-based dataset owned by test_org1
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    datasetId = dataset.id
  })

  test('default visibility is privateOrg for org-owned dataset', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    // Navigate to Share > Permissions tab
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Check visibility dropdown value
    const visibilitySelect = page.locator('.v-select').first()
    await expect(visibilitySelect).toContainText(/uniquement les administrateurs/)
  })

  test('change visibility to privateOrgContrib', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Open visibility dropdown and select privateOrgContrib
    await page.locator('.v-select').first().click()
    await page.getByRole('option', { name: /administrateurs et contributeurs/ }).click()
    // Wait for save
    await page.waitForTimeout(1000)
    // Verify via API
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => p.type === 'organization' && p.roles?.includes('contrib') && p.classes?.includes('read'))).toBeTruthy()
  })

  test('change visibility to public', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.locator('.v-select').first().click()
    await page.getByRole('option', { name: /tout le monde/ }).click()
    await page.waitForTimeout(1000)
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => !p.type && p.classes?.includes('read') && p.classes?.includes('list'))).toBeTruthy()
  })

  test('change visibility back to privateOrg removes public permission', async ({ page, goToWithAuth }) => {
    // First make it public via API
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [{ operations: [], classes: ['list', 'read'] }])
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.locator('.v-select').first().click()
    await page.getByRole('option', { name: /uniquement les administrateurs/ }).click()
    await page.waitForTimeout(1000)
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => !p.type && p.classes?.includes('read'))).toBeFalsy()
  })

  test('default contrib profile is adminOnly', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Second select is contrib profile
    const contribSelect = page.locator('.v-select').nth(1)
    await expect(contribSelect).toContainText(/uniquement les administrateurs/)
  })

  test('set contribWriteData profile', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.locator('.v-select').nth(1).click()
    await page.getByRole('option', { name: /modifier uniquement les données/ }).click()
    await page.waitForTimeout(1000)
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => p.roles?.includes('contrib') && p.operations?.includes('writeData'))).toBeTruthy()
  })

  test('set contribWriteAll profile', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.locator('.v-select').nth(1).click()
    await page.getByRole('option', { name: /tout modifier et supprimer/ }).click()
    await page.waitForTimeout(1000)
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => p.roles?.includes('contrib') && p.classes?.includes('write') && p.operations?.includes('delete'))).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the e2e tests**

```bash
npx playwright test tests/features/ui/permissions.e2e.spec.ts --project=e2e
```

Expected: tests pass (or fail if UI selectors need adjustment — fix selectors as needed)

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/permissions.e2e.spec.ts
git commit -m "test: add e2e tests for permissions visibility and contrib profiles"
```

---

### Task 9: Write e2e tests — detailed mode (add/edit/delete)

**Files:**
- Modify: `tests/features/ui/permissions.e2e.spec.ts`

Add tests for detailed mode: enable toggle, add permission by email, add member, add all-users, add partner org, add owner org with department, edit, delete.

- [ ] **Step 1: Add detailed mode tests**

Append to the test.describe block in `tests/features/ui/permissions.e2e.spec.ts`:

```typescript
  test('enable detailed mode shows table and add button', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Toggle detailed mode
    await page.getByLabel(/Édition détaillée/).click()
    await expect(page.getByRole('button', { name: /Ajouter des permissions/ })).toBeVisible({ timeout: 5000 })
  })

  test('add user permission by email', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.getByLabel(/Édition détaillée/).click()
    await page.getByRole('button', { name: /Ajouter des permissions/ }).click()
    // In the dialog: select User scope
    await page.locator('.v-dialog .v-select').first().click()
    await page.getByRole('option', { name: 'Utilisateur' }).click()
    // Select email mode
    await page.locator('.v-dialog .v-select').nth(1).click()
    await page.getByRole('option', { name: /adresse email/ }).click()
    // Enter email
    await page.locator('.v-dialog').getByLabel('Email').fill('test_user2@test.com')
    // Validate
    await page.locator('.v-dialog').getByRole('button', { name: /Valider/ }).click()
    await page.waitForTimeout(1000)
    // Verify via API
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => p.type === 'user' && p.email === 'test_user2@test.com')).toBeTruthy()
  })

  test('add partner organization permission', async ({ page, goToWithAuth }) => {
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    await page.getByLabel(/Édition détaillée/).click()
    await page.getByRole('button', { name: /Ajouter des permissions/ }).click()
    // Scope is already "Organisation" by default for org owner
    // Select partner mode
    await page.locator('.v-dialog').getByText(/partenaires/).click()
    // Select the partner
    await page.locator('.v-dialog').getByLabel(/Partenaire/).click()
    await page.getByRole('option', { name: 'Test Org 2' }).click()
    // Validate
    await page.locator('.v-dialog').getByRole('button', { name: /Valider/ }).click()
    await page.waitForTimeout(1000)
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.some((p: any) => p.type === 'organization' && p.id === 'test_org2')).toBeTruthy()
  })

  test('delete a permission', async ({ page, goToWithAuth }) => {
    // First add a permission via API
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
      { type: 'user', email: 'test_user2@test.com', classes: ['read', 'list'], operations: [] }
    ])
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Detailed mode should auto-enable since there's a non-standard permission
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
    // Click delete button
    await page.locator('table').getByRole('button').filter({ has: page.locator('.mdi-delete') }).first().click()
    await page.waitForTimeout(1000)
    const perms = await ax.get(`/api/v1/datasets/${datasetId}/permissions`)
    expect(perms.data.length).toBe(0)
  })
```

- [ ] **Step 2: Run tests**

```bash
npx playwright test tests/features/ui/permissions.e2e.spec.ts --project=e2e
```

- [ ] **Step 3: Fix any selector issues**

Adjust selectors based on actual Vuetify 4 DOM if needed.

- [ ] **Step 4: Commit**

```bash
git add tests/features/ui/permissions.e2e.spec.ts
git commit -m "test: add e2e tests for detailed mode permissions (add/edit/delete)"
```

---

### Task 10: Write e2e tests — access control and auto-detailed-mode

**Files:**
- Modify: `tests/features/ui/permissions.e2e.spec.ts`

- [ ] **Step 1: Add access control and auto-detailed-mode tests**

```typescript
  test('non-admin cannot edit permissions', async ({ page, goToWithAuth }) => {
    // test_user5 is contrib of test_org1, not admin
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user5')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Visibility select should be disabled
    const visibilitySelect = page.locator('.v-select').first()
    await expect(visibilitySelect.locator('input')).toBeDisabled()
  })

  test('detailed mode auto-enables for non-standard permissions', async ({ page, goToWithAuth }) => {
    // Add a non-standard permission via API
    const ax = await axiosAuth('test_user1@test.com', 'test_org1')
    await ax.put(`/api/v1/datasets/${datasetId}/permissions`, [
      { type: 'user', email: 'test_user3@test.com', classes: ['read', 'list'], operations: ['writeDescription'] }
    ])
    await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
    await page.getByRole('tab', { name: /Permissions/ }).click()
    // Table should be visible (detailed mode auto-enabled)
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
    // The permission should appear in the table
    await expect(page.locator('table')).toContainText('test_user3')
  })
```

- [ ] **Step 2: Run tests**

```bash
npx playwright test tests/features/ui/permissions.e2e.spec.ts --project=e2e
```

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/permissions.e2e.spec.ts
git commit -m "test: add e2e tests for access control and auto-detailed-mode"
```

---

### Task 11: Final lint, type-check, and full test run

- [ ] **Step 1: Run lint**

```bash
npm -w ui run lint
```

- [ ] **Step 2: Run full e2e test suite**

```bash
npx playwright test --project=e2e
```

Verify no existing tests are broken by the changes.

- [ ] **Step 3: Fix any issues**

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -u
git commit -m "fix: address final review issues in permissions parity"
```
