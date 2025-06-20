<template lang="html">
  <journal-view
    v-if="journal"
    :journal="journal"
    :task-progress="taskProgress"
    type="dataset"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/journal'>()

const datasetStore = provideDatasetStore(route.params.id)
const { journal, journalFetch, taskProgress, taskProgressFetch } = datasetStore
useDatasetWatch(datasetStore, ['journal', 'taskProgress'])

if (!journalFetch.initialized.value) journalFetch.refresh()
if (!taskProgressFetch.initialized.value) taskProgressFetch.refresh()
</script>
