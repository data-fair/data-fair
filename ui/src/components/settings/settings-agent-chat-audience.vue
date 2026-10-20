<template>
  <div>
    <p class="text-body-2 mb-2">
      {{ audience?.length ? t('restricted') : t('everyone') }}
    </p>
    <v-row
      v-for="(rule, i) in audience ?? []"
      :key="i"
      dense
      align="center"
    >
      <v-col
        cols="12"
        sm="5"
      >
        <v-select
          :model-value="rule.department"
          :items="departmentItems"
          :label="t('department')"
          density="compact"
          hide-details
          @update:model-value="(department: string) => updateRule(i, { ...rule, department })"
        />
      </v-col>
      <v-col
        cols="10"
        sm="6"
      >
        <v-select
          :model-value="rule.roles ?? []"
          :items="roles"
          :label="t('roles')"
          :placeholder="t('allRoles')"
          persistent-placeholder
          multiple
          chips
          closable-chips
          density="compact"
          hide-details
          @update:model-value="(roles: string[]) => updateRule(i, { ...rule, roles })"
        />
      </v-col>
      <v-col
        cols="2"
        sm="1"
      >
        <v-btn
          :icon="mdiDelete"
          :title="t('removeRule')"
          variant="text"
          color="warning"
          density="comfortable"
          @click="audience = (audience ?? []).filter((_, j) => j !== i)"
        />
      </v-col>
    </v-row>
    <v-btn
      :prepend-icon="mdiPlus"
      variant="text"
      color="primary"
      class="mt-2"
      @click="audience = [...(audience ?? []), { department: '-' }]"
    >
      {{ t('addRule') }}
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  everyone: "Tous les membres de l'organisation ont accès à l'assistant. Ajoutez des règles pour le réserver à certains départements ou rôles."
  restricted: "Seuls les membres correspondant à l'une de ces règles ont accès à l'assistant."
  department: Département
  rootDepartment: Organisation principale seulement
  anyDepartment: Tous les départements
  roles: Rôles
  allRoles: Tous les rôles
  addRule: Ajouter une règle
  removeRule: Supprimer la règle
en:
  everyone: Every member of the organization can use the assistant. Add rules to reserve it to some departments or roles.
  restricted: Only the members matching one of these rules can use the assistant.
  department: Department
  rootDepartment: Main organization only
  anyDepartment: All departments
  roles: Roles
  allRoles: All roles
  addRule: Add a rule
  removeRule: Remove the rule
</i18n>

<script setup lang="ts">
import { type Settings } from '#api/types'
import { mdiDelete, mdiPlus } from '@mdi/js'

type Rule = NonNullable<Settings['agentChatAudience']>[number]

const audience = defineModel<Settings['agentChatAudience']>()
const props = defineProps<{
  departments: { id: string, name: string }[]
  roles: string[]
}>()

const { t } = useI18n()

const departmentItems = computed(() => [
  { value: '-', title: t('rootDepartment') },
  { value: '*', title: t('anyDepartment') },
  ...props.departments.map(d => ({ value: d.id, title: d.name }))
])

const updateRule = (i: number, rule: Rule) => {
  if (!rule.roles?.length) delete rule.roles
  audience.value = (audience.value ?? []).map((r, j) => j === i ? rule : r)
}
</script>
