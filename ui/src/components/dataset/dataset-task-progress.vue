<template>
  <v-list-item v-if="taskProgress?.task">
    <v-list-item-title class="text-body-medium">
      {{ t('activity') }} - {{ t('tasks.' + taskProgress.task) }}
    </v-list-item-title>
    <div class="d-flex align-center mt-1">
      <v-progress-linear
        :model-value="taskProgress.progress === -1 ? undefined : taskProgress.progress"
        :indeterminate="taskProgress.progress === -1 && !taskProgress.error"
        :color="taskProgress.error ? 'error' : 'primary'"
        :title="compact ? stepOrPercent : undefined"
        class="flex-grow-1"
        rounded
        height="6"
      />
      <span
        v-if="!compact && stepOrPercent"
        class="text-caption text-medium-emphasis ml-2 flex-shrink-0"
      >
        {{ stepOrPercent }}
      </span>
    </div>
  </v-list-item>
</template>

<i18n lang="yaml">
fr:
  activity: Activité
  tasks:
    initialize: Initialisation
    store: Chargement
    index: Indexation
    extend: Extensions
    analyze: Analyse
    validate: Validation
    finalize: Finalisation
    normalize: Conversion
    download: Téléchargement
  steps:
    refresh: rafraîchissement de l'index
    checkConstraints: vérification des contraintes
    switchAlias: bascule d'alias
en:
  activity: Activity
  tasks:
    initialize: Initialization
    store: Loading
    index: Indexing
    extend: Extensions
    analyze: Analysis
    validate: Validation
    finalize: Finalization
    normalize: Conversion
    download: Download
  steps:
    refresh: index refresh
    checkConstraints: constraints check
    switchAlias: alias switch
</i18n>

<script setup lang="ts">
import { type TaskProgress } from '~/composables/dataset/dataset-store'

const props = defineProps<{
  taskProgress?: TaskProgress
  compact?: boolean
}>()

const { t } = useI18n()

// a named step replaces the percentage: the bar is indeterminate during these phases
const stepOrPercent = computed(() => {
  if (props.taskProgress?.step) return t('steps.' + props.taskProgress.step)
  if (props.taskProgress && props.taskProgress.progress !== -1) return `${props.taskProgress.progress}%`
  return null
})
</script>
