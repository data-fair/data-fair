<template>
  <p class="mb-5">
    {{ t('description') }}
  </p>

  <df-tutorial-alert
    v-if="resource.owner?.department"
    id="permissions-deps"
    :text="t('readDepPermissionsDoc')"
    href="https://data-fair.github.io/3/user-guide-backoffice/department"
    persistent
  />

  <v-progress-linear
    v-if="!modelValue"
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
      class="mt-4"
    />

    <v-switch
      v-model="detailedMode"
      color="primary"
      :label="t('detailedMode')"
      class="mt-4"
    />
  </template>

  <template v-if="detailedMode && ownerDetails && api">
    <permission-dialog
      v-if="!disabled"
      :permission-classes="permissionClasses"
      :owner="ownerDetails"
      @update:model-value="addPermission"
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
      v-if="modelValue && modelValue.length"
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
            <div v-if="item.type === 'organization' && !item.department">
              {{ t('organizationName', { name: item.name }) }}
            </div>
            <div v-if="item.type === 'organization' && item.department && item.department !== '-'">
              {{ t('organizationName', { name: item.name + ' / ' + item.department }) }}
            </div>
            <div v-if="item.type === 'organization' && item.department && item.department === '-'">
              {{ t('organizationName', { name: item.name + ' / ' + t('noDep') }) }}
            </div>
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
              :owner="ownerDetails"
              @update:model-value="p => editPermission(index, p)"
            >
              <template #activator="{ props: activatorProps }">
                <v-btn
                  color="primary"
                  v-bind="activatorProps"
                  :icon="mdiPencil"
                  variant="text"
                  size="small"
                />
              </template>
            </permission-dialog>
            <v-btn
              v-if="!disabled"
              :icon="mdiDelete"
              variant="text"
              size="small"
              color="warning"
              @click="deletePermission(index)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
  </template>
</template>

<i18n lang="yaml">
fr:
  description: Permettez à d'autres utilisateurs d'utiliser cette ressource.
  visibilityLabel: Qui peut consulter cette ressource ?
  visibility:
    public: Tout le monde
    privateOrg: Uniquement les administrateurs de l'organisation {org}
    privateOrgContrib: Les administrateurs et contributeurs de l'organisation {org}
    privateUser: Uniquement l'utilisateur {user}
    sharedInOrg: Tous les utilisateurs de l'organisation {org}
  contribProfileLabel: Qui peut contribuer à cette ressource ?
  contribProfile:
    adminOnly: Uniquement les administrateurs de l'organisation {org}
    contribWriteData: Les contributeurs de l'organisation {org} peuvent modifier uniquement les données et seulement si elles sont compatibles
    contribWriteNoBreaking: Les contributeurs de l'organisation {org} peuvent tout modifier à l'exception de ce qui risquerait de provoquer une rupture de compatibilité
    contribWriteAll: Les contributeurs de l'organisation {org} peuvent tout modifier et supprimer la ressource
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des applications publiques.
  warningPublicApp: Vous ne devriez pas rendre cette application publique, elle utilise des sources de données privées.
  addPermission: Ajouter des permissions
  editPermission: Éditer des permissions
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
  noDep: aucun département
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
    privateOrgContrib: Admins and contributors of the organization {org}
    privateUser: Only yourself
    sharedInOrg: Any user of the organization {org}
  contribProfileLabel: Who can contribute to this resource ?
  contribProfile:
    adminOnly: Only admins of the organization {org}
    contribWriteData: Contribs of the organization {org} can update only the data and only if it is compatible
    contribWriteNoBreaking: Contribs of the organization {org} can update anything except for what might constitute a breaking change
    contribWriteAll: Contribs of the organization {org} can update anything and delete the resource
  warningPrivateDataset: You should not make this dataset private as long as it is used in public applications.
  warningPublicApp: You should not make this application public as long as it uses private datasets.
  addPermission: Add permissions
  editPermission: Edit permissions
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
  noDep: no department
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
import { mdiPencil, mdiDelete } from '@mdi/js'
import PermissionDialog from './permission-dialog.vue'
import type { Permission } from '#api/types'

type PermissibleResource = {
  id: string
  owner: { type: string, id: string, name?: string, department?: string }
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
}>()

const emit = defineEmits<{ save: [value: Permission[]] }>()

const { t } = useI18n()

const detailedMode = ref(false)
const ownerDetails = ref<{ type: string, id: string, name?: string, departments?: { id: string, name: string }[] } | null>(null)
type ApiEndpoint = { operationId: string, summary: string, 'x-permissionClass'?: string, 'x-altPermissions'?: PermissionClassItem[] }
type ApiDoc = { paths: Record<string, Record<string, ApiEndpoint>> }
const api = ref<ApiDoc | null>(null)

const orgName = computed(() => props.resource.owner?.name || props.resource.owner?.id || '')

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

// --- Permission classes built from API doc ---

type PermissionClassItem = { id: string, title: string, class: string }
const permissionClasses = computed<Record<string, PermissionClassItem[]>>(() => {
  const classes: Record<string, PermissionClassItem[]> = {
    list: [{
      id: 'list',
      title: 'Lister la ressource',
      class: 'list'
    }]
  }
  if (api.value) {
    for (const path of Object.keys(api.value.paths)) {
      for (const method of Object.keys(api.value.paths[path])) {
        const endpoint: ApiEndpoint = api.value.paths[path][method]
        const permClass = endpoint['x-permissionClass']
        if (!permClass) continue
        classes[permClass] = (classes[permClass] || []).concat({
          id: endpoint.operationId,
          title: endpoint.summary,
          class: permClass
        })
        for (const altPermission of endpoint['x-altPermissions'] || []) {
          classes[permClass] = (classes[permClass] || []).concat([altPermission])
        }
      }
    }
  }
  return classes
})

// --- Computed states ---

const isPublic = computed(() => !!props.modelValue?.find(isPublicPermission))

function save (newPermissions: Permission[]) {
  emit('save', newPermissions)
}

const visibility = computed({
  get () {
    if (!props.modelValue) return undefined
    if (isPublic.value) return 'public'
    if (props.modelValue.find(isSharedInOrgPermission)) return 'sharedInOrg'
    if (props.modelValue.find(isPrivateOrgContribPermission)) return 'privateOrgContrib'
    if (props.resource.owner?.type === 'organization') return 'privateOrg'
    return 'privateUser'
  },
  set (v) {
    if (!props.modelValue) return
    const next = props.modelValue
      .filter((p) => !isPublicPermission(p) && !isSharedInOrgPermission(p) && !isPrivateOrgContribPermission(p))

    if (v === 'sharedInOrg' || v === 'public' || v === 'privateOrgContrib') {
      next.push({ type: 'organization', id: props.resource.owner.id, name: orgName.value, roles: ['contrib'], operations: [], classes: ['list', 'read', 'readAdvanced'] })
    }
    if (v === 'sharedInOrg') {
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
    items.push({ value: 'privateOrg', title: t('visibility.privateOrg', { org: orgName.value }), disabled: privateDisabled })
    items.push({ value: 'privateOrgContrib', title: t('visibility.privateOrgContrib', { org: orgName.value }), disabled: privateDisabled })
    items.push({ value: 'sharedInOrg', title: t('visibility.sharedInOrg', { org: orgName.value }), disabled: privateDisabled })
  } else {
    items.push({ value: 'privateUser', title: t('visibility.privateUser', { user: orgName.value }), disabled: privateDisabled })
  }
  items.push({ value: 'public', title: t('visibility.public'), disabled: !!(props.hasPrivateParents && !isPublic.value) })
  return items
})

const contribProfile = computed({
  get () {
    if (!props.modelValue) return undefined
    if (props.modelValue.find(isContribWriteAllPermission)) return 'contribWriteAll'
    if (props.modelValue.find(isContribWriteNoBreakingPermission)) return 'contribWriteNoBreaking'
    if (props.modelValue.find(isContribWriteDataPermission)) return 'contribWriteData'
    return 'adminOnly'
  },
  set (v) {
    if (!props.modelValue) return
    const next = props.modelValue
      .filter((p) => !isContribWriteAllPermission(p) && !isContribWriteDataPermission(p) && !isContribWriteNoBreakingPermission(p))

    const dep = props.resource.owner?.department || '-'
    const writeDataOps = props.resource.isRest
      ? ['createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines']
      : ['writeData', 'cancelDraft']

    if (v === 'contribWriteData') {
      next.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: writeDataOps, classes: [] })
    } else if (v === 'contribWriteNoBreaking') {
      next.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: [...writeDataOps, 'writeDescription', 'postMetadataAttachment', 'deleteMetadataAttachment'], classes: [] })
    } else if (v === 'contribWriteAll') {
      next.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: ['delete'], classes: ['write'] })
    }
    save(next)
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
    if (!api.value) await fetchApiDoc()
  }
})

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

// --- Fetch API doc ---

async function fetchApiDoc () {
  const docPath = props.resourceType === 'datasets'
    ? `datasets/${props.resource.id}/private-api-docs.json`
    : `applications/${props.resource.id}/api-docs.json`
  api.value = await $fetch(docPath)
}

// --- Permission CRUD for detailed mode ---

function addPermission (p: Permission) {
  if (!props.modelValue) return
  save([...props.modelValue, p])
}

function editPermission (index: number, p: Permission) {
  if (!props.modelValue) return
  const next = [...props.modelValue]
  next[index] = p
  save(next)
}

function deletePermission (index: number) {
  if (!props.modelValue) return
  const next = [...props.modelValue]
  next.splice(index, 1)
  save(next)
}
</script>
