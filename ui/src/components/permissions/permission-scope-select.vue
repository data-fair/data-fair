<template>
  <v-row dense>
    <v-col
      cols="12"
      md="5"
    >
      <v-select
        :model-value="scenario"
        :items="scenarioItems"
        :label="t('scopeLabel')"
        :placeholder="t('noScope')"
        persistent-placeholder
        clearable
        hide-details="auto"
        @update:model-value="setScenario"
      />
    </v-col>

    <template v-if="scenario === 'group'">
      <v-col
        v-if="ownerDetails?.departments?.length"
        cols="12"
        md="3"
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
      v-if="scenario === 'member'"
      cols="12"
      md="5"
    >
      <member-select
        :model-value="member"
        :organization="owner"
        @update:model-value="setMember"
      />
    </v-col>

    <v-col
      v-if="scenario === 'partner'"
      cols="12"
      md="5"
    >
      <v-select
        :model-value="modelValue?.id ?? null"
        :items="ownerDetails?.partners ?? []"
        item-title="name"
        item-value="id"
        :label="t('partner')"
        hide-details="auto"
        @update:model-value="patch({ id: $event ?? undefined })"
      />
    </v-col>

    <v-col
      v-if="scenario === 'email'"
      cols="12"
      md="5"
    >
      <v-text-field
        :model-value="modelValue?.email ?? ''"
        :label="t('email')"
        hide-details="auto"
        @update:model-value="patch({ email: $event || undefined })"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  scopeLabel: Je veux voir les permissions pour
  noScope: Toutes les ressources
  scenarios:
    group: Un groupe d'utilisateurs dans l'organisation
    member: Un utilisateur en particulier dans l'organisation
    partner: Un partenaire de mon organisation
    email: Un utilisateur désigné par son adresse email
    connected: Un utilisateur connecté sur la plateforme
    anonymous: Un visiteur anonyme
  department: Département
  allDeps: Tous les départements
  rolesLabel: Rôles (tous si aucun coché)
  partner: Partenaire
  email: Adresse email
en:
  scopeLabel: Show the permissions of
  noScope: All resources
  scenarios:
    group: A group of users in the organization
    member: One user in particular in the organization
    partner: A partner of my organization
    email: A user designated by their email address
    connected: A user logged in on the platform
    anonymous: An anonymous visitor
  department: Department
  allDeps: All departments
  rolesLabel: Roles (all if none is selected)
  partner: Partner
  email: Email address
</i18n>

<script setup lang="ts">
import MemberSelect from './member-select.vue'
import {
  scenarioFromScope,
  scopeFromScenario,
  type PermissionScenario,
  type PermissionScope
} from '@data-fair/data-fair-shared/permissions/scope.ts'

const props = defineProps<{
  owner: { type: string, id: string, name?: string }
}>()

const modelValue = defineModel<PermissionScope | null>({ default: null })

const { t } = useI18n()

type Member = { id: string, name: string, email?: string, role?: string, department?: string }
type OwnerDetails = {
  departments?: { id: string, name: string }[]
  roles?: string[]
  partners?: { id: string, name: string }[]
}
const ownerDetails = ref<OwnerDetails | null>(null)

// the scenario is UI intent: it is derived from the scope, not stored in the url, and it
// survives an empty sub-selection that no scope can express
const scenario = ref<PermissionScenario | null>(scenarioFromScope(modelValue.value, props.owner.id))
watch(modelValue, (value) => {
  const derived = scenarioFromScope(value, props.owner.id)
  if (derived) scenario.value = derived
  else if (!value) scenario.value = null
})

// the group / member / partner scenarios only mean something for an organization account
const scenarioItems = computed(() => {
  const scenarios: PermissionScenario[] = props.owner.type === 'organization'
    ? ['group', 'member', 'partner', 'email', 'connected', 'anonymous']
    : ['email', 'connected', 'anonymous']
  return scenarios.map(value => ({ value, title: t('scenarios.' + value) }))
})

const setScenario = (value: PermissionScenario | null) => {
  scenario.value = value
  modelValue.value = value ? scopeFromScenario(value, props.owner.id) : null
}

const patch = (patch: Partial<PermissionScope>) => {
  if (!modelValue.value) return
  modelValue.value = { ...modelValue.value, ...patch }
}

// "main organization only" is deliberately absent: matchPermission does not filter a
// member without a department at all, so it would be indistinguishable from "all
// departments" — see docs/architecture/permissions-recap.md.
const departmentItems = computed(() => [
  { value: null, title: t('allDeps') },
  ...(ownerDetails.value?.departments ?? []).map(d => ({ value: d.id, title: `${d.name} (${d.id})` }))
])

// a member's role and department travel with the scope: they are what their group grants
const selectedMember = ref<Member | null>(null)
const member = computed(() => {
  if (!modelValue.value?.id || modelValue.value.id === '*') return null
  if (selectedMember.value?.id === modelValue.value.id) return selectedMember.value
  return { id: modelValue.value.id, name: '' }
})
const setMember = (value: Member | null) => {
  selectedMember.value = value
  modelValue.value = value
    ? {
        type: 'user',
        id: value.id,
        email: value.email,
        roles: value.role ? [value.role] : undefined,
        department: value.department || undefined
      }
    : { type: 'user' }
}

// --- owner details from simple-directory, same source as the permissions editor ---

onMounted(async () => {
  const res = await fetch(`${$sdUrl}/api/${props.owner.type}s/${props.owner.id}`)
  const data = await res.json()
  if (data.departments) {
    data.departments.sort((d1: { name: string }, d2: { name: string }) => d1.name.localeCompare(d2.name))
  }
  ownerDetails.value = data
})
</script>
