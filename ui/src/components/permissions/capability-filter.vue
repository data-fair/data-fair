<template>
  <v-select
    v-model="model"
    :items="items"
    :label="t('label')"
    multiple
    clearable
    density="compact"
    variant="outlined"
    hide-details
    rounded="md"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  resourceType: 'datasets' | 'applications'
}>()

const model = defineModel<string[]>({ default: () => [] })

const { t } = useI18n()

const filterClasses: Record<string, string[]> = {
  datasets: ['read', 'write', 'manageOwnLines', 'admin'],
  applications: ['read', 'write', 'admin']
}

const items = computed(() => filterClasses[props.resourceType].map(value => ({ title: t('classes.' + value), value })))
</script>

<i18n lang="yaml">
fr:
  label: Capacité de l'utilisateur
  classes:
    read: Lecture
    write: Écriture
    manageOwnLines: Écriture de ses lignes
    admin: Administration
en:
  label: User capability
  classes:
    read: Read
    write: Write
    manageOwnLines: Write own lines
    admin: Administration
</i18n>
