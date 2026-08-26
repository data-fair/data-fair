<template>
  <v-list-item v-if="taskProgress?.task">
    <v-list-item-title class="text-body-medium">
      {{ t('activity') }} - {{ t('tasks.' + taskProgress.task) }}
    </v-list-item-title>
    <div class="d-flex align-center mt-1">
      <v-progress-linear
        :model-value="taskProgress.progress === -1 ? (taskProgress.error ? 100 : undefined) : taskProgress.progress"
        :indeterminate="taskProgress.progress === -1 && !taskProgress.error"
        :color="taskProgress.error ? 'error' : 'primary'"
        class="flex-grow-1"
        rounded
        height="6"
      >
        <!-- not a native title attribute: it changes on every publication, which resets the
          browser tooltip timer so it never shows during an active task -->
        <v-tooltip
          v-if="compact && stepOrPercent"
          activator="parent"
          location="bottom"
        >
          {{ stepOrPercent }}
        </v-tooltip>
      </v-progress-linear>
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
    start: Démarrage de l'indexation
    indexing: '{n} lignes indexées'
    refresh: Rafraîchissement de l'index
    checkConstraints: Vérification des contraintes
    switchAlias: Bascule de l'alias
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
    start: Indexing startup
    indexing: '{n} rows indexed'
    refresh: Index refresh
    checkConstraints: Constraints check
    switchAlias: Alias switch
</i18n>

<script setup lang="ts">
import { type TaskProgress } from '~/composables/dataset/dataset-store'

const props = defineProps<{
  taskProgress?: TaskProgress
  compact?: boolean
}>()

const { t, locale } = useI18n()

// label next to the bar: percentage when determinate, named step when set, both when applicable
const stepOrPercent = computed(() => {
  if (!props.taskProgress) return null
  const parts: string[] = []
  if (props.taskProgress.progress !== -1) parts.push(`${props.taskProgress.progress}%`)
  if (props.taskProgress.step) parts.push(t('steps.' + props.taskProgress.step, { n: (props.taskProgress.count ?? 0).toLocaleString(locale.value) }))
  return parts.join(' · ') || null
})
</script>
