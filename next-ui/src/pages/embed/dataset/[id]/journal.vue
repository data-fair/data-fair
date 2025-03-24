<template lang="html">
  <journal-view
    v-if="journal"
    :journal="journal"
    type="dataset"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { createDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/journal'>()

const { journal, journalFetch } = createDatasetStore(route.params.id)
useDatasetWatch('journal')

if (!journalFetch.initialized.value) journalFetch.refresh()
</script>
