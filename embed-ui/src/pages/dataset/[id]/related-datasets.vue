<template lang="html">
  <v-container
    fluid
    data-iframe-height
    style="min-height:500px;"
    class="bg-surface"
  >
    <dataset-related-datasets
      v-model="relatedDatasets"
      @update:model-value="datasetStore.patchDataset.execute({relatedDatasets: relatedDatasets})"
    />
  </v-container>
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

useFrameContent()
const route = useRoute<'/dataset/[id]/related-datasets'>()

const relatedDatasets = ref<{ id: string, title: string }[]>([])
const datasetStore = provideDatasetStore(route.params.id)
watch(datasetStore.dataset, () => {
  relatedDatasets.value = datasetStore.dataset.value?.relatedDatasets ?? []
})
</script>
