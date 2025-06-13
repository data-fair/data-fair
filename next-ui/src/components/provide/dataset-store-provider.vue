<template>
  <slot :dataset-store="datasetStore" />
</template>

<script setup lang="ts">
const { id, draftMode, journal, watch: shouldWatch } = defineProps({
  id: { type: String, required: true },
  draftMode: { type: Boolean, default: false },
  journal: { type: Boolean, default: false },
  watch: { type: Boolean, default: true }
})

watch(() => id, () => { throw new Error('"id" should not be mutated, re-render the provide-dataset-store') })
watch(() => draftMode, () => { throw new Error('"draftMode" should not be mutated, re-render the provide-dataset-store') })
watch(() => shouldWatch, () => { throw new Error('"watch" should not be mutated, re-render the provide-dataset-store') })

const datasetStore = provideDatasetStore(id, draftMode)
if (journal) datasetStore.journalFetch.refresh()
if (shouldWatch) useDatasetWatch(datasetStore, shouldWatch ? ['journal', 'info'] : [])

defineExpose({ datasetStore })
</script>
