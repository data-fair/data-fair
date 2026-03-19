<template lang="html">
  <dataset-schema-view data-iframe-height />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/fields'>()

provideDatasetStore(route.params.id, false, true)
</script>
