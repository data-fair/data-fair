<template lang="html">
  <dataset-publication-sites data-iframe-height />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

useFrameContent()
const route = useRoute<'/dataset/[id]/publication-sites'>()

provideDatasetStore(route.params.id, false, true)
</script>
