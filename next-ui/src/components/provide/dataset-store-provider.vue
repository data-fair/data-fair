<template>
  <slot :dataset-store="datasetStore" />
</template>

<script setup lang="ts">
const { id, draftMode } = defineProps({
  id: { type: String, required: true },
  draftMode: { type: Boolean, default: false }
})

watch(() => id, () => { throw new Error('"id" should not be mutated, re-render the provide-dataset-store') })
watch(() => draftMode, () => { throw new Error('"draftMode" should not be mutated, re-render the provide-dataset-store') })

const datasetStore = provideDatasetStore(id, draftMode)

defineExpose({ datasetStore })
</script>
