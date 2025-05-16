<template lang="html">
  <journal-view
    v-if="journal"
    :journal="journal"
    type="dataset"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/journal'>()

const datasetStore = provideDatasetStore(route.params.id)
const { journal, journalFetch } = datasetStore
useDatasetWatch(datasetStore, 'journal')

if (!journalFetch.initialized.value) journalFetch.refresh()
</script>
