<template lang="html">
  <journal
    v-if="dataset?.journal"
    :journal="dataset.journal"
    type="dataset"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { createDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/journal'>()

const { dataset } = createDatasetStore(route.params.id)
useDatasetWatch('journal')
</script>
