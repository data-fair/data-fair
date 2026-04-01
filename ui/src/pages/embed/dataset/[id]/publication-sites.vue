<template>
  <dataset-publication-sites data-iframe-height />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset/store'

const route = useRoute<'/embed/dataset/[id]/publication-sites'>()

provideDatasetStore(route.params.id, false, true)
</script>
