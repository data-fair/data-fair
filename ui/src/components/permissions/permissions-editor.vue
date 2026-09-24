<template>
  <df-tutorial-alert
    v-if="!simple && resource.owner?.department"
    id="permissions-deps"
    :text="t('readDepPermissionsDoc')"
    href="https://data-fair.github.io/3/user-guide-backoffice/department"
    persistent
  />

  <p class="mb-2">
    {{ t('description') }}
  </p>

  <v-progress-linear
    v-if="!modelValue"
    indeterminate
  />
  <template v-else>
    <v-alert
      v-if="!simple && hasPrivateParents && isPublic"
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
      :base-color="visibilityModified ? 'accent' : undefined"
      :color="visibilityModified ? 'accent' : undefined"
      variant="outlined"
      density="compact"
      hide-details
    />

    <v-select
      v-if="resource.owner?.type === 'organization'"
      v-model="contribProfile"
      :disabled="disabled || visibility === 'privateOrg'"
      :items="contribProfileItems"
      :label="t('contribProfileLabel')"
      :base-color="contribProfileModified ? 'accent' : undefined"
      :color="contribProfileModified ? 'accent' : undefined"
      variant="outlined"
      density="compact"
      hide-details
      class="mt-4"
    />

    <v-switch
      v-if="!simple && resource.rest && resource.rest.lineOwnership"
      v-model="allUsersManageOwnLines"
      :disabled="disabled"
      color="primary"
      :label="t('allUsersManageOwnLines')"
      hide-details
      class="mt-4"
    />

    <v-switch
      v-if="!simple"
      v-model="detailedMode"
      color="primary"
      density="comfortable"
      :label="t('detailedMode')"
      hide-details
      class="mt-4"
    />
  </template>

  <template v-if="!simple && detailedMode && ownerDetails">
    <v-table
      density="compact"
      class="mt-2 rounded elevation-1"
    >
      <thead>
        <tr>
          <th>{{ t('scope') }}</th>
          <th>{{ t('actions') }}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <!-- implicit and immutable: owning the resource always grants everything to its admins -->
        <tr>
          <td>
            <div>
              {{ resource.owner?.type === 'user' ? t('implicitScopeUser', labelParams) : t(ownerDepartment ? 'implicitScopeDep' : 'implicitScopeOrg', labelParams) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ t('implicitHint') }}
            </div>
          </td>
          <td>
            <v-list
              density="compact"
              class="py-1"
              style="background: transparent"
            >
              <v-list-item
                class="pa-0"
                style="min-height:25px"
              >
                {{ t('allActions') }}
              </v-list-item>
            </v-list>
          </td>
          <td />
        </tr>
        <tr
          v-for="(item, index) in modelValue"
          :key="index"
        >
          <td>
            <div v-if="!item.type">
              {{ t('public') }}
            </div>
            <div v-if="item.type === 'user'">
              {{ t('userName', { name: item.name || item.id || item.email }) }}
            </div>
            <!-- a department permission also matches the members of the organization root, '-' matches them only -->
            <template v-if="item.type === 'organization'">
              <div>{{ t('organizationName', { name: item.name }) }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ !item.department || item.department === '*' ? t('scopeAll') : item.department === '-' ? t('scopeRoot') : t('scopeDep', { dep: item.departmentName || item.department }) }}
              </div>
            </template>
            <div v-if="item.type === 'organization' && (!item.roles || !item.roles.length)">
              {{ t('allRoles') }}
            </div>
            <div v-if="item.type === 'organization' && (item.roles && item.roles.length)">
              {{ t('restrictedRoles', { roles: item.roles.join(', ') }) }}
            </div>
          </td>
          <td>
            <v-list
              density="compact"
              class="py-1"
              style="background: transparent"
            >
              <template
                v-for="(classOperations, permClass) in permissionClasses"
                :key="permClass"
              >
                <v-list-item
                  v-if="(item.classes || []).includes(permClass as string) || classOperations.filter((o) => (item.operations || []).includes(o.id)).length"
                  class="pa-0"
                  style="min-height:25px"
                >
                  {{ t('classNames.' + permClass) }}
                  <template v-if="!(item.classes || []).includes(permClass as string)">
                    ({{ classOperations.filter((o) => (item.operations || []).find((oid: string) => o.id && o.id === oid)).map((o) => o.title.toLowerCase().replace('.', '')).join(' - ') }})
                  </template>
                </v-list-item>
              </template>
            </v-list>
          </td>
          <td class="text-right">
            <permission-dialog
              v-if="!disabled"
              :model-value="item"
              :permission-classes="permissionClasses"
              :resource-type="resourceType"
              :owner="ownerDetails"
              @update:model-value="p => editPermission(index, p)"
            >
              <template #activator="{ props: activatorProps }">
                <!-- density rather than size: the glyph keeps its native 24px grid and stays crisp -->
                <v-btn
                  color="primary"
                  v-bind="activatorProps"
                  :icon="mdiPencil"
                  :title="t('editPermission')"
                  variant="text"
                  density="comfortable"
                />
              </template>
            </permission-dialog>
            <confirm-menu
              v-if="!disabled"
              variant="menu"
              yes-color="warning"
              :title="t('deletePermission')"
              :text="t('deletePermissionConfirm')"
              :tooltip="t('deletePermission')"
              :btn-props="{ color: 'warning', icon: true, variant: 'text', density: 'comfortable' }"
              @confirm="deletePermission(index)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>

    <permission-dialog
      v-if="!disabled"
      :permission-classes="permissionClasses"
      :resource-type="resourceType"
      :owner="ownerDetails"
      @update:model-value="addPermission"
    >
      <template #activator="{ props: activatorProps }">
        <v-btn
          color="primary"
          :prepend-icon="mdiPlus"
          class="mt-3"
          v-bind="activatorProps"
        >
          {{ t('addPermission') }}
        </v-btn>
      </template>
    </permission-dialog>
  </template>
</template>

<i18n lang="yaml">
fr:
  description: Permettez à d'autres utilisateurs d'utiliser cette ressource.
  visibilityLabel: Qui peut consulter cette ressource ?
  visibility:
    public: Tout le monde
    privateOrg: Uniquement les administrateurs de l'organisation {org}
    privateOrgDep: Uniquement les administrateurs du département {dep} et ceux de l'organisation {org}
    privateOrgContrib: Les administrateurs et contributeurs de l'organisation {org}
    privateOrgContribDep: Les administrateurs et contributeurs du département {dep} et de l'organisation {org}
    privateUser: Uniquement l'utilisateur {user}
    sharedInOrg: Tous les utilisateurs de l'organisation {org}
    sharedInDep: Tous les utilisateurs du département {dep} et de l'organisation {org}
    sharedInOrgDep: Tous les utilisateurs de l'organisation {org}, tous départements confondus
  contribProfileLabel: Qui peut contribuer à cette ressource ?
  contribProfile:
    adminOnly: Uniquement les administrateurs de l'organisation {org}
    adminOnlyDep: Uniquement les administrateurs du département {dep} et ceux de l'organisation {org}
    contribWriteData: Les contributeurs {scope} peuvent modifier uniquement les données et seulement si elles sont compatibles
    contribWriteNoBreaking: Les contributeurs {scope} peuvent tout modifier à l'exception de ce qui risquerait de provoquer une rupture de compatibilité
    contribWriteAll: Les contributeurs {scope} peuvent tout modifier et supprimer la ressource
  contribScope:
    org: de l'organisation {org}
    dep: du département {dep} et de l'organisation {org}
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des applications publiques.
  warningPublicApp: Vous ne devriez pas rendre cette application publique, elle utilise des sources de données privées.
  addPermission: Ajouter une permission
  editPermission: Éditer cette permission
  deletePermission: Supprimer cette permission
  deletePermissionConfirm: Cette permission sera retirée de la ressource.
  public: Public
  organization: Organisation
  user: Utilisateur
  organizationName: Organisation {name}
  userName: Utilisateur {name}
  rolesLabel: Rôles (tous si aucun coché)
  allRoles: Tous les rôles
  restrictedRoles: "Restreint aux rôles : {roles}"
  validate: Valider
  cancel: Annuler
  scope: Portée
  detailedActions: Actions détaillées
  detailedMode: Édition détaillée des permissions
  actions: Actions
  permissionsUpdated: Les permissions ont été mises à jour
  scopeDep: "Département {dep} et racine de l'organisation"
  scopeRoot: Racine de l'organisation uniquement
  scopeAll: Tous les départements
  implicitScopeOrg: Administrateurs de l'organisation {org}
  implicitScopeDep: Administrateurs du département {dep} et de l'organisation {org}
  implicitScopeUser: Utilisateur {org}
  implicitHint: Permission implicite, liée à la propriété de la ressource
  allActions: Toutes les actions
  readDepPermissionsDoc: Consultez la documentation sur les départements pour comprend les permissions des différents membres du département.
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
  visibilityLabel: Who can read this dataset ?
  visibility:
    public: Anyone
    privateOrg: Only admins of the organization {org}
    privateOrgDep: Only admins of the department {dep} and those of the organization {org}
    privateOrgContrib: Admins and contributors of the organization {org}
    privateOrgContribDep: Admins and contributors of the department {dep} and of the organization {org}
    privateUser: Only yourself
    sharedInOrg: Any user of the organization {org}
    sharedInDep: Any user of the department {dep} and of the organization {org}
    sharedInOrgDep: Any user of the organization {org}, across all departments
  contribProfileLabel: Who can contribute to this resource ?
  contribProfile:
    adminOnly: Only admins of the organization {org}
    adminOnlyDep: Only admins of the department {dep} and those of the organization {org}
    contribWriteData: Contribs {scope} can update only the data and only if it is compatible
    contribWriteNoBreaking: Contribs {scope} can update anything except for what might constitute a breaking change
    contribWriteAll: Contribs {scope} can update anything and delete the resource
  contribScope:
    org: of the organization {org}
    dep: of the department {dep} and of the organization {org}
  warningPrivateDataset: You should not make this dataset private as long as it is used in public applications.
  warningPublicApp: You should not make this application public as long as it uses private datasets.
  addPermission: Add a permission
  editPermission: Edit this permission
  deletePermission: Delete this permission
  deletePermissionConfirm: This permission will be removed from the resource.
  public: Public
  organization: Organization
  user: User
  organizationName: Organization {name}
  userName: User {name}
  rolesLabel: Roles (all if none is selected)
  allRoles: All roles
  restrictedRoles: "Restricted to roles : {roles}"
  validate: Validate
  cancel: Cancel
  scope: Scope
  detailedActions: Detailed actions
  detailedMode: Detailed edition of permissions
  actions: Actions
  permissionsUpdated: Permissions were updated
  scopeDep: Department {dep} and organization root
  scopeRoot: Organization root only
  scopeAll: All departments
  implicitScopeOrg: Admins of the organization {org}
  implicitScopeDep: Admins of the department {dep} and of the organization {org}
  implicitScopeUser: User {org}
  implicitHint: Implicit permission, derived from the ownership of the resource
  allActions: All actions
  readDepPermissionsDoc: Read the documentation about departments to understand the permissions applied to members of the departement and of the organization.
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

<script setup lang="ts">
import { mdiPencil, mdiPlus } from '@mdi/js'
import PermissionDialog from './permission-dialog.vue'
import { permissionClassesPicker, datasetContext } from '@data-fair/data-fair-shared/permissions/operations.ts'
import type { Permission } from '#api/types'

type PermissibleResource = {
  id: string
  owner: { type: string, id: string, name?: string, department?: string, departmentName?: string }
  isRest?: boolean
  isVirtual?: boolean
  file?: { name: string }
  rest?: { lineOwnership?: boolean }
}

const props = defineProps<{
  modelValue: Permission[] | null
  resource: PermissibleResource
  resourceType: 'datasets' | 'applications'
  disabled: boolean
  hasPublicDeps?: boolean
  hasPrivateParents?: boolean
  simple?: boolean
  /** Pristine server copy — enables `accent` colouring of the simplified-mode selects when the current value differs. */
  serverData?: Permission[] | null
}>()

const emit = defineEmits<{ save: [value: Permission[]] }>()

const { t, locale } = useI18n()

const detailedMode = ref(false)
const ownerDetails = ref<{ type: string, id: string, name?: string, departments?: { id: string, name: string }[] } | null>(null)

const orgName = computed(() => props.resource.owner?.name || props.resource.owner?.id || '')

// the owner's department scopes every org-level permission written here, and the labels say so:
// members of the organization root keep their role on it, members of other departments get nothing.
const ownerDepartment = computed(() => props.resource.owner?.department)
const labelParams = computed(() => ({ org: orgName.value, dep: props.resource.owner?.departmentName || ownerDepartment.value || '' }))
const contribScope = computed(() => t(ownerDepartment.value ? 'contribScope.dep' : 'contribScope.org', labelParams.value))

// the department scope carried by every org-level permission written here, mirroring what the API
// stores at creation ('-' for the organization root); the name keeps the table legible
const depScope = computed(() => {
  const scope: Pick<Permission, 'department' | 'departmentName'> = { department: ownerDepartment.value || '-' }
  if (props.resource.owner?.departmentName) scope.departmentName = props.resource.owner.departmentName
  return scope
})

// --- Permission type checkers ---

function isInDepartmentPermission (p: Permission): boolean {
  return !p.department || (!props.resource.owner?.department && p.department === '-') || p.department === props.resource.owner?.department
}

function isPublicPermission (p: Permission): boolean {
  return !p.type && !!p.classes?.includes('read') && !!p.classes?.includes('list')
}

function isSharedInOrgPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && !p.department &&
    !!p.classes?.includes('read') && !!p.classes?.includes('list') && !p.roles
}

// department-owned resources only: every role of the owner's department, and of the organization root
function isSharedInDepPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && !!ownerDepartment.value && p.department === ownerDepartment.value &&
    !!p.classes?.includes('read') && !!p.classes?.includes('list') && !p.roles?.length
}

function isPrivateOrgContribPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
    !!p.classes?.includes('read') && !!p.classes?.includes('list') && !!p.roles?.includes('contrib')
}

function isManageOwnLinesPermission (p: Permission): boolean {
  return p.type === 'user' && p.id === '*' && !!p.classes?.includes('manageOwnLines')
}

function isContribWriteDataPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
    p.roles?.length === 1 && p.roles[0] === 'contrib' &&
    !!p.operations && p.operations.includes(props.resource.isRest ? 'createLine' : 'writeData') &&
    !p.operations.includes('writeDescription')
}

function isContribWriteNoBreakingPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
    p.roles?.length === 1 && p.roles[0] === 'contrib' &&
    !!p.operations?.includes('writeDescription') && !p.operations?.includes('writeDescriptionBreaking')
}

function isContribWriteAllPermission (p: Permission): boolean {
  return p.type === 'organization' && props.resource.owner?.type === 'organization' &&
    p.id === props.resource.owner.id && isInDepartmentPermission(p) &&
    p.roles?.length === 1 && p.roles[0] === 'contrib' &&
    !!p.classes?.includes('write') && !!p.operations?.includes('delete')
}

// --- Permission classes built from the shared source of truth ---
// Built from the descriptors in shared/permissions/operations.ts, contextual to the dataset's shape:
// surfaces every grantable operation with its true permission class — including admin operations that
// have no documented route.

type PermissionClassItem = { id: string, title: string }
const permissionClasses = computed<Record<string, PermissionClassItem[]>>(() => {
  const ctx = props.resourceType === 'datasets' ? datasetContext(props.resource as any) : undefined
  return permissionClassesPicker(props.resourceType, locale.value as 'fr' | 'en', ctx)
})

// --- Computed states ---

const isPublic = computed(() => !!props.modelValue?.find(isPublicPermission))

function save (newPermissions: Permission[]) {
  emit('save', newPermissions)
}

function computeVisibility (perms: Permission[] | null | undefined) {
  if (!perms) return undefined
  if (perms.find(isPublicPermission)) return 'public'
  if (perms.find(isSharedInOrgPermission)) return 'sharedInOrg'
  if (perms.find(isSharedInDepPermission)) return 'sharedInDep'
  if (perms.find(isPrivateOrgContribPermission)) return 'privateOrgContrib'
  if (props.resource.owner?.type === 'organization') return 'privateOrg'
  return 'privateUser'
}

const visibility = computed({
  get () {
    return computeVisibility(props.modelValue)
  },
  set (v) {
    if (!props.modelValue) return
    const next = props.modelValue
      .filter((p) => !isPublicPermission(p) && !isSharedInOrgPermission(p) && !isSharedInDepPermission(p) && !isPrivateOrgContribPermission(p))
      // contributors who cannot read the resource must not be able to write it either
      .filter((p) => v !== 'privateOrg' || (!isContribWriteAllPermission(p) && !isContribWriteDataPermission(p) && !isContribWriteNoBreakingPermission(p)))

    if (v === 'sharedInOrg' || v === 'sharedInDep' || v === 'public' || v === 'privateOrgContrib') {
      // keep the contrib permission scoped to the owner's department ('-' for the organization root),
      // as the API does at creation: omitting it silently widens read access to every department
      next.push({ type: 'organization', id: props.resource.owner.id, ...depScope.value, name: orgName.value, roles: ['contrib'], operations: [], classes: ['list', 'read', 'readAdvanced'] })
    }
    if (v === 'sharedInDep') {
      next.push({ type: 'organization', id: props.resource.owner.id, ...depScope.value, name: orgName.value, operations: [], classes: ['list', 'read'] })
    } else if (v === 'sharedInOrg') {
      next.push({ type: 'organization', id: props.resource.owner.id, name: orgName.value, operations: [], classes: ['list', 'read'] })
    } else if (v === 'public') {
      next.push({ operations: [], classes: ['list', 'read'] })
    }
    save(next)
  }
})

const visibilityItems = computed(() => {
  const items: { value: string, title: string, disabled: boolean }[] = []
  const privateDisabled = !!(props.hasPublicDeps && isPublic.value)
  if (props.resource.owner?.type === 'organization') {
    const dep = ownerDepartment.value ? 'Dep' : ''
    items.push({ value: 'privateOrg', title: t('visibility.privateOrg' + dep, labelParams.value), disabled: privateDisabled })
    items.push({ value: 'privateOrgContrib', title: t('visibility.privateOrgContrib' + dep, labelParams.value), disabled: privateDisabled })
    if (ownerDepartment.value) items.push({ value: 'sharedInDep', title: t('visibility.sharedInDep', labelParams.value), disabled: privateDisabled })
    items.push({ value: 'sharedInOrg', title: t('visibility.sharedInOrg' + dep, labelParams.value), disabled: privateDisabled })
  } else {
    items.push({ value: 'privateUser', title: t('visibility.privateUser', { user: orgName.value }), disabled: privateDisabled })
  }
  items.push({ value: 'public', title: t('visibility.public'), disabled: false })
  return items
})

function computeContribProfile (perms: Permission[] | null | undefined) {
  if (!perms) return undefined
  if (perms.find(isContribWriteAllPermission)) return 'contribWriteAll'
  if (perms.find(isContribWriteNoBreakingPermission)) return 'contribWriteNoBreaking'
  if (perms.find(isContribWriteDataPermission)) return 'contribWriteData'
  return 'adminOnly'
}

const contribProfile = computed({
  get () {
    return computeContribProfile(props.modelValue)
  },
  set (v) {
    if (!props.modelValue) return
    const next = props.modelValue
      .filter((p) => !isContribWriteAllPermission(p) && !isContribWriteDataPermission(p) && !isContribWriteNoBreakingPermission(p))

    const writeDataOps = props.resource.isRest
      ? ['createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines']
      : ['writeData', 'cancelDraft']

    if (v === 'contribWriteData') {
      next.push({ type: 'organization', id: props.resource.owner.id, ...depScope.value, name: orgName.value, roles: ['contrib'], operations: writeDataOps, classes: [] })
    } else if (v === 'contribWriteNoBreaking') {
      next.push({ type: 'organization', id: props.resource.owner.id, ...depScope.value, name: orgName.value, roles: ['contrib'], operations: [...writeDataOps, 'writeDescription', 'postMetadataAttachment', 'deleteMetadataAttachment'], classes: [] })
    } else if (v === 'contribWriteAll') {
      next.push({ type: 'organization', id: props.resource.owner.id, ...depScope.value, name: orgName.value, roles: ['contrib'], operations: ['delete'], classes: ['write'] })
    }
    save(next)
  }
})

const contribProfileItems = computed(() => {
  const scope = { scope: contribScope.value }
  const items = [
    { value: 'adminOnly', title: t('contribProfile.adminOnly' + (ownerDepartment.value ? 'Dep' : ''), labelParams.value) }
  ]
  if (props.resource.isRest || props.resource.file) {
    items.push({ value: 'contribWriteData', title: t('contribProfile.contribWriteData', scope) })
  }
  if (props.resource.isRest || props.resource.isVirtual || props.resource.file) {
    items.push({ value: 'contribWriteNoBreaking', title: t('contribProfile.contribWriteNoBreaking', scope) })
  }
  items.push({ value: 'contribWriteAll', title: t('contribProfile.contribWriteAll', scope) })
  return items
})

const visibilityModified = computed(() =>
  !!(props.simple && props.serverData && computeVisibility(props.modelValue) !== computeVisibility(props.serverData))
)

const contribProfileModified = computed(() =>
  !!(props.simple && props.serverData && computeContribProfile(props.modelValue) !== computeContribProfile(props.serverData))
)

const allUsersManageOwnLines = computed({
  get () {
    return !!props.modelValue?.find(isManageOwnLinesPermission)
  },
  set (v) {
    if (!props.modelValue) return
    const next = props.modelValue.filter((p) => !isManageOwnLinesPermission(p))
    if (v) next.push({ type: 'user', id: '*', operations: ['readSafeSchema'], classes: ['manageOwnLines'] })
    save(next)
  }
})

const hasDetailedPermission = computed(() => {
  return !!props.modelValue?.find((p) =>
    !isPublicPermission(p) &&
    !isSharedInOrgPermission(p) &&
    !isSharedInDepPermission(p) &&
    !isPrivateOrgContribPermission(p) &&
    !isManageOwnLinesPermission(p) &&
    !isContribWriteDataPermission(p) &&
    !isContribWriteNoBreakingPermission(p) &&
    !isContribWriteAllPermission(p)
  )
})

// --- Auto-enable detailed mode on first load if existing detailed permissions ---

let detailedModeInitialized = false
watch(() => props.modelValue, (perms) => {
  if (!perms || detailedModeInitialized) return
  detailedModeInitialized = true
  if (hasDetailedPermission.value) detailedMode.value = true
}, { immediate: true })

// --- Watch detailed mode to lazily fetch owner details + API doc ---

watch(detailedMode, async (newVal) => {
  if (newVal) {
    if (!ownerDetails.value) await fetchOwnerDetails()
  }
}, { immediate: true })

// --- Fetch owner details from simple-directory ---

async function fetchOwnerDetails () {
  const res = await fetch(`${$sdUrl}/api/${props.resource.owner.type}s/${props.resource.owner.id}`)
  const data = await res.json()
  data.type = props.resource.owner.type
  if (data.departments) {
    data.departments.sort((d1: { name: string }, d2: { name: string }) => d1.name.localeCompare(d2.name))
  }
  ownerDetails.value = data
}

// --- Permission CRUD for detailed mode ---

function addPermission (permissions: Permission[]) {
  if (!props.modelValue) return
  save([...props.modelValue, ...permissions])
}

function editPermission (index: number, permissions: Permission[]) {
  if (!props.modelValue) return
  const next = [...props.modelValue]
  next.splice(index, 1, ...permissions)
  save(next)
}

function deletePermission (index: number) {
  if (!props.modelValue) return
  const next = [...props.modelValue]
  next.splice(index, 1)
  save(next)
}
</script>
