<template>
  <v-row dense>
    <v-col
      cols="12"
      md="4"
    >
      <v-select
        :model-value="scopeType"
        :items="scopeTypeItems"
        :label="t('scope')"
        hide-details="auto"
        @update:model-value="setScopeType"
      />
    </v-col>

    <template v-if="scopeType === 'organization'">
      <v-col
        cols="12"
        md="4"
      >
        <v-select
          v-model="orgSelectType"
          :items="orgSelectTypes"
          hide-details="auto"
        />
      </v-col>
      <template v-if="orgSelectType === 'ownerOrg'">
        <v-col
          v-if="ownerDetails?.departments?.length"
          cols="12"
          md="4"
        >
          <v-select
            :model-value="modelValue?.department ?? null"
            :items="departmentItems"
            :label="t('department')"
            hide-details="auto"
            @update:model-value="patch({ department: $event ?? undefined })"
          />
        </v-col>
        <v-col
          v-if="ownerDetails?.roles?.length"
          cols="12"
          md="4"
        >
          <v-select
            :model-value="modelValue?.roles ?? []"
            :items="ownerDetails.roles"
            :label="t('rolesLabel')"
            multiple
            hide-details="auto"
            @update:model-value="patch({ roles: $event })"
          />
        </v-col>
      </template>
      <v-col
        v-else
        cols="12"
        md="4"
      >
        <v-select
          :model-value="modelValue?.id ?? null"
          :items="ownerDetails?.partners ?? []"
          item-title="name"
          item-value="id"
          :label="t('partner')"
          hide-details="auto"
          @update:model-value="patch({ id: $event ?? undefined, department: undefined, roles: [] })"
        />
      </v-col>
    </template>

    <template v-if="scopeType === 'user'">
      <v-col
        cols="12"
        md="4"
      >
        <v-select
          v-model="userSelectType"
          :items="userSelectTypes"
          hide-details="auto"
        />
      </v-col>
      <v-col
        v-if="userSelectType === 'member'"
        cols="12"
        md="4"
      >
        <member-select
          :model-value="member"
          :organization="owner"
          @update:model-value="patch({ id: $event?.id, email: $event?.email })"
        />
      </v-col>
      <v-col
        v-if="userSelectType === 'email'"
        cols="12"
        md="4"
      >
        <v-text-field
          :model-value="modelValue?.email ?? ''"
          :label="t('email')"
          hide-details="auto"
          @update:model-value="patch({ email: $event || undefined, id: undefined })"
        />
      </v-col>
    </template>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  scope: Portée
  allResources: Aucune simulation (toutes les ressources)
  public: Public
  organization: Organisation
  user: Utilisateur
  ownerOrg: Organisation propriétaire
  amongPartners: Parmi les organisations partenaires
  partner: Partenaire
  department: Département
  allDeps: Tous les départements
  rolesLabel: Rôles (tous si aucun coché)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
en:
  scope: Scope
  allResources: No simulation (all resources)
  public: Public
  organization: Organization
  user: User
  ownerOrg: Owner organization
  amongPartners: Among partner organizations
  partner: Partner
  department: Department
  allDeps: All departments
  rolesLabel: Roles (all if none is selected)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designed by their email
  email: Email
</i18n>

<script setup lang="ts">
import MemberSelect from './member-select.vue'
import type { PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const props = defineProps<{
  owner: { type: string, id: string, name?: string }
}>()

const modelValue = defineModel<PermissionScope | null>({ default: null })

const { t } = useI18n()

type OwnerDetails = {
  type: string
  id: string
  name?: string
  departments?: { id: string, name: string }[]
  roles?: string[]
  partners?: { id: string, name: string }[]
}
const ownerDetails = ref<OwnerDetails | null>(null)

const scopeType = computed(() => modelValue.value?.type ?? null)

const scopeTypeItems = computed(() => {
  const items: { value: PermissionScope['type'] | null, title: string }[] = [
    { value: null, title: t('allResources') },
    { value: 'public', title: t('public') },
    { value: 'user', title: t('user') }
  ]
  if (props.owner.type === 'organization') items.push({ value: 'organization', title: t('organization') })
  return items
})

const patch = (patch: Partial<PermissionScope>) => {
  if (!modelValue.value) return
  modelValue.value = { ...modelValue.value, ...patch }
}

const setScopeType = (type: PermissionScope['type'] | null) => {
  if (!type) {
    modelValue.value = null
  } else if (type === 'organization') {
    modelValue.value = { type, id: props.owner.id }
  } else {
    modelValue.value = { type }
  }
}

// --- organization sub-selector ---

const orgSelectTypes = computed(() => [
  { value: 'ownerOrg', title: t('ownerOrg') },
  { value: 'partner', title: t('amongPartners') }
])

const orgSelectType = computed({
  get: () => (modelValue.value?.id === props.owner.id ? 'ownerOrg' : 'partner'),
  set: (v) => {
    modelValue.value = v === 'ownerOrg'
      ? { type: 'organization', id: props.owner.id }
      : { type: 'organization' }
  }
})

// "main organization only" is deliberately absent: matchPermission does not filter a
// member without a department at all, so it would be indistinguishable from "all
// departments" — see docs/architecture/permissions-recap.md.
const departmentItems = computed(() => [
  { value: null, title: t('allDeps') },
  ...(ownerDetails.value?.departments ?? []).map(d => ({ value: d.id, title: `${d.name} (${d.id})` }))
])

// --- user sub-selector ---

const userSelectTypes = computed(() => {
  const types = [{ value: '*', title: t('allUsers') }]
  if (props.owner.type === 'organization') types.push({ value: 'member', title: t('memberOf', { org: props.owner.name }) })
  types.push({ value: 'email', title: t('userByEmail') })
  return types
})

const userSelectType = computed({
  get: () => {
    if (modelValue.value?.id === '*') return '*'
    if (modelValue.value?.email && !modelValue.value?.id) return 'email'
    return 'member'
  },
  set: (v) => {
    if (v === '*') modelValue.value = { type: 'user', id: '*' }
    else modelValue.value = { type: 'user' }
  }
})

const member = computed(() => {
  if (!modelValue.value?.id || modelValue.value.id === '*') return null
  return { id: modelValue.value.id, name: '' }
})

// --- owner details from simple-directory, same source as the permissions editor ---

onMounted(async () => {
  const res = await fetch(`${$sdUrl}/api/${props.owner.type}s/${props.owner.id}`)
  const data = await res.json()
  data.type = props.owner.type
  if (data.departments) {
    data.departments.sort((d1: { name: string }, d2: { name: string }) => d1.name.localeCompare(d2.name))
  }
  ownerDetails.value = data
})
</script>
