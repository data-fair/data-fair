<template>
  <v-row>
    <v-col
      cols="12"
      md="6"
    >
      <v-select
        :model-value="modelValue?.kind ?? null"
        :items="kindItems"
        :label="t('visitorKind')"
        @update:model-value="setKind"
      />
    </v-col>
    <v-col
      v-if="modelValue?.kind === 'member'"
      cols="12"
      md="6"
    >
      <member-select
        :model-value="modelValue.member ?? null"
        :organization="{ id: account.id, name: account.name }"
        :department="account.department"
        @update:model-value="m => emitVisitor({ member: m ? { id: m.id, name: m.name, email: m.email, role: m.role, department: m.department } : undefined })"
      />
    </v-col>
    <template v-if="modelValue?.kind === 'role'">
      <v-col
        cols="12"
        :md="departmentItems.length ? 3 : 6"
      >
        <v-select
          :model-value="modelValue.role ?? null"
          :items="orgDetails?.roles ?? []"
          :label="t('role')"
          @update:model-value="role => emitVisitor({ role: role ?? undefined })"
        />
      </v-col>
      <v-col
        v-if="departmentItems.length"
        cols="12"
        md="3"
      >
        <v-select
          :model-value="modelValue.department ?? null"
          :items="departmentItems"
          :label="t('department')"
          @update:model-value="department => emitVisitor({ department: department ?? undefined })"
        />
      </v-col>
    </template>
    <v-col
      v-if="modelValue?.kind === 'partner'"
      cols="12"
      md="6"
    >
      <v-select
        :model-value="partner"
        :items="orgDetails?.partners ?? []"
        item-title="name"
        item-value="id"
        return-object
        :label="t('partner')"
        :no-data-text="t('noPartner')"
        @update:model-value="p => emitVisitor({ partner: p ? { id: p.id, name: p.name } : undefined })"
      />
    </v-col>
    <v-col
      v-if="modelValue?.kind === 'email'"
      cols="12"
      md="6"
    >
      <v-text-field
        v-model="emailInput"
        :label="t('email')"
        type="email"
        :hint="t('emailHint')"
        @keyup.enter="commitEmail"
        @blur="commitEmail"
      />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { $sdUrl } from '~/context'
import MemberSelect from './member-select.vue'

const props = defineProps<{
  modelValue: AuditVisitor | null
  account: { id: string, name: string, department?: string }
}>()

const emit = defineEmits<{ 'update:modelValue': [value: AuditVisitor | null] }>()

const { t } = useI18n()

const kindItems = computed(() => auditVisitorKinds.map(kind => ({ value: kind, title: t('kinds.' + kind, { org: props.account.name }) })))

const setKind = (kind: AuditVisitorKind | null) => {
  emit('update:modelValue', kind ? { kind } : null)
}
const emitVisitor = (patch: Partial<AuditVisitor>) => {
  if (!props.modelValue) return
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

// roles, departments and partners of the audited organization, as offered by the permissions editor
type OrgDetails = { roles?: string[], departments?: { id: string, name: string }[], partners?: { id: string, name: string }[] }
const orgDetails = ref<OrgDetails | null>(null)
watch(() => props.account.id, async (id) => {
  orgDetails.value = null
  const res = await fetch(`${$sdUrl}/api/organizations/${encodeURIComponent(id)}`)
  if (res.ok) orgDetails.value = await res.json()
}, { immediate: true })

// a department admin only audits their own department, the choice is forced (see asVisitorParam)
const departmentItems = computed(() => {
  if (props.account.department || !orgDetails.value?.departments?.length) return []
  return [
    { value: null, title: t('mainOrg') },
    ...orgDetails.value.departments.map(d => ({ value: d.id, title: d.name }))
  ]
})

// the URL only carries the partner id, its name comes from the organization's partners
const partner = computed(() => {
  const id = props.modelValue?.partner?.id
  if (!id) return null
  return orgDetails.value?.partners?.find(p => p.id === id) ?? props.modelValue!.partner!
})

const emailInput = ref(props.modelValue?.email ?? '')
watch(() => props.modelValue?.email, (email) => { emailInput.value = email ?? '' })
const commitEmail = () => {
  const email = emailInput.value.trim()
  if (email === (props.modelValue?.email ?? '')) return
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) return
  emitVisitor({ email: email || undefined })
}
</script>

<i18n lang="yaml">
fr:
  visitorKind: Visiteur simulé
  kinds:
    member: Un membre de {org}
    role: Les membres de {org} ayant un rôle
    partner: Les membres d'une organisation partenaire
    email: Un utilisateur désigné par son adresse email
    connected: N'importe quel utilisateur connecté
    anonymous: Un visiteur anonyme
  role: Rôle
  department: Département
  mainOrg: Organisation principale
  partner: Organisation partenaire
  noPartner: Aucune organisation partenaire
  email: Adresse email
  emailHint: Validez avec Entrée
en:
  visitorKind: Simulated visitor
  kinds:
    member: A member of {org}
    role: The members of {org} with a role
    partner: The members of a partner organization
    email: A user designated by their email address
    connected: Any authenticated user
    anonymous: An anonymous visitor
  role: Role
  department: Department
  mainOrg: Main organization
  partner: Partner organization
  noPartner: No partner organization
  email: Email address
  emailHint: Press Enter to validate
</i18n>
