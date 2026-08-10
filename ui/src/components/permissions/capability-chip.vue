<template>
  <v-tooltip
    v-if="tier"
    location="top"
  >
    <template #activator="{ props: tooltipProps }">
      <v-chip
        v-bind="tooltipProps"
        :color="tierColors[tier]"
        size="small"
        variant="outlined"
        :prepend-icon="mdiShieldAccountOutline"
      >
        {{ t('tier.' + tier) }}
      </v-chip>
    </template>
    <span>{{ classesLabel }}</span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { mdiShieldAccountOutline } from '@mdi/js'

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  userPermissions?: string[]
}>()

const { t, te } = useI18n()

const tier = computed(() => capabilityTier(props.resourceType, props.userPermissions))

const tierColors: Record<string, string> = {
  admin: 'warning',
  write: 'primary',
  manageOwnLines: 'primary',
  read: 'success',
  list: 'default'
}

const classesLabel = computed(() => {
  if (!props.userPermissions) return ''
  return grantedClasses(props.resourceType, props.userPermissions)
    .map(c => te('tier.' + c) ? t('tier.' + c) : c)
    .join(', ')
})
</script>

<i18n lang="yaml">
fr:
  tier:
    admin: Administration
    write: Écriture
    manageOwnLines: Écriture de ses lignes
    read: Lecture
    readAdvanced: Lecture avancée
    list: Listage
    use: Utilisation
en:
  tier:
    admin: Administration
    write: Write
    manageOwnLines: Write own lines
    read: Read
    readAdvanced: Advanced read
    list: List
    use: Use
</i18n>
