<template>
  <div v-if="permissions">
    <p>{{ t('description') }}</p>

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

    <v-alert
      v-if="hasPublicDeps"
      type="warning"
      variant="outlined"
      class="mt-3"
      density="compact"
    >
      {{ t('warningPrivateDataset') }}
    </v-alert>
  </div>
  <v-progress-linear
    v-else
    indeterminate
  />
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
    contribWriteData: les contributeurs peuvent modifier les données compatibles
    contribWriteNoBreaking: les contributeurs peuvent tout modifier sauf les changements incompatibles
    contribWriteAll: les contributeurs peuvent tout modifier et supprimer la ressource
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des applications publiques.
  permissionsUpdated: Les permissions ont été mises à jour
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
    contribWriteData: contributors can update only compatible data
    contribWriteNoBreaking: contributors can update anything except breaking changes
    contribWriteAll: contributors can update anything and delete the resource
  warningPrivateDataset: You should not make this dataset private as long as it is used in public applications.
  permissionsUpdated: Permissions were updated
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  resource: any
  resourceType: 'datasets' | 'applications'
  canGetPermissions?: boolean
  canSetPermissions?: boolean
  hasPublicDeps?: boolean
}>()

const disabled = computed(() => !props.canSetPermissions)

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()

const permissions = ref<any[] | null>(null)

// Fetch permissions on mount
onMounted(async () => {
  const perms = await $fetch<any[]>(`${props.resourceType}/${props.resource.id}/permissions`)
  perms.forEach((p: any) => { if (!p.type) p.type = null })
  permissions.value = perms
})

// Permission type checkers
const isPublicPermission = (p: any) =>
  !p.type && p.classes?.includes('read') && p.classes?.includes('list')

const isSharedInOrgPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id && !p.department &&
  p.classes?.includes('read') && p.classes?.includes('list') && !p.roles

const isPrivateOrgContribPermission = (p: any) =>
  p.type === 'organization' && props.resource.owner?.type === 'organization' &&
  p.id === props.resource.owner.id &&
  p.classes?.includes('read') && p.classes?.includes('list') && p.roles?.includes('contrib')

const isContribWriteAllPermission = (p: any) =>
  p.type === 'organization' && p.id === props.resource.owner?.id &&
  p.roles?.includes('contrib') && p.classes?.includes('write')

const isContribWriteDataPermission = (p: any) =>
  p.type === 'organization' && p.id === props.resource.owner?.id &&
  p.roles?.length === 1 && p.roles[0] === 'contrib' &&
  p.operations?.includes(props.resource.isRest ? 'createLine' : 'writeData') &&
  !p.operations?.includes('writeDescription')

const isContribWriteNoBreakingPermission = (p: any) =>
  p.type === 'organization' && p.id === props.resource.owner?.id &&
  p.roles?.length === 1 && p.roles[0] === 'contrib' &&
  p.operations?.includes('writeDescription') && !p.operations?.includes('writeDescriptionBreaking')

const orgName = computed(() => props.resource.owner?.name || props.resource.owner?.id || '')

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
      .filter((p: any) => !isPublicPermission(p) && !isSharedInOrgPermission(p) && !isPrivateOrgContribPermission(p))

    if (v === 'sharedInOrg' || v === 'public' || v === 'privateOrgContrib') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, name: orgName.value, roles: ['contrib'], operations: [], classes: ['list', 'read', 'readAdvanced'] })
    }
    if (v === 'sharedInOrg') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, name: orgName.value, operations: [], classes: ['list', 'read'] })
    } else if (v === 'public') {
      permissions.value.push({ operations: [], classes: ['list', 'read'] })
    }
    save()
  }
})

const visibilityItems = computed(() => {
  const items: any[] = []
  if (props.resource.owner?.type === 'organization') {
    items.push({ value: 'privateOrg', title: t('visibility.privateOrg', { org: orgName.value }) })
    items.push({ value: 'privateOrgContrib', title: t('visibility.privateOrgContrib', { org: orgName.value }) })
    items.push({ value: 'sharedInOrg', title: t('visibility.sharedInOrg', { org: orgName.value }) })
  } else {
    items.push({ value: 'privateUser', title: t('visibility.privateUser', { user: orgName.value }) })
  }
  items.push({ value: 'public', title: t('visibility.public') })
  return items
})

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
      .filter((p: any) => !isContribWriteAllPermission(p) && !isContribWriteDataPermission(p) && !isContribWriteNoBreakingPermission(p))

    const dep = props.resource.owner?.department || '-'
    const writeDataOps = props.resource.isRest
      ? ['createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines']
      : ['writeData', 'cancelDraft']

    if (v === 'contribWriteData') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: writeDataOps, classes: [] })
    } else if (v === 'contribWriteNoBreaking') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: [...writeDataOps, 'writeDescription', 'postMetadataAttachment', 'deleteMetadataAttachment'], classes: [] })
    } else if (v === 'contribWriteAll') {
      permissions.value.push({ type: 'organization', id: props.resource.owner.id, department: dep, name: orgName.value, roles: ['contrib'], operations: ['delete'], classes: ['write'] })
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

async function save () {
  if (!permissions.value) return
  const clean = JSON.parse(JSON.stringify(permissions.value))
  clean.forEach((p: any) => {
    if (!p.type) delete p.type
    if (!p.id) delete p.id
    if (!p.department) delete p.department
  })
  await $fetch(`${props.resourceType}/${props.resource.id}/permissions`, { method: 'PUT', body: clean })
  sendUiNotif({ type: 'success', msg: t('permissionsUpdated') })
}
</script>
