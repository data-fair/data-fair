<template lang="html">
  <dataset-schema-view data-iframe-height />
</template>

<script setup lang="ts">
import { createDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/fields'>()

createDatasetStore(route.params.id)
</script>
