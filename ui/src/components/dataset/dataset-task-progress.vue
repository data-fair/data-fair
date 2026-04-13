<template>
  <v-list-item v-if="taskProgress?.task">
    <v-list-item-title class="text-body-medium">
      {{ t('activity') }} - {{ t('tasks.' + taskProgress.task) }}
    </v-list-item-title>
    <v-progress-linear
      :model-value="taskProgress.progress === -1 ? undefined : taskProgress.progress"
      :indeterminate="taskProgress.progress === -1 && !taskProgress.error"
      :color="taskProgress.error ? 'error' : 'primary'"
      class="mt-1"
      rounded
      height="6"
    />
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
</i18n>

<script setup lang="ts">
import { type TaskProgress } from '~/composables/dataset/dataset-store'

defineProps<{
  taskProgress?: TaskProgress
}>()

const { t } = useI18n()
</script>
