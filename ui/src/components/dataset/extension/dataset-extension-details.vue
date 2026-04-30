<template>
  <div ref="previewRoot">
    <div ref="tableSentinel" />
    <dataset-table
      :height="tableHeight"
      :cols="visibleCols"
    />
  </div>
</template>

<script setup lang="ts">
import { useWindowSize, useResizeObserver } from '@vueuse/core'
import DatasetTable from '~/components/dataset/table/dataset-table.vue'

const props = defineProps<{
  remoteService: string
  action: string
  dataset: any
  remoteServicesMap: Record<string, any>
  resourceUrl: string
}>()

const extensionKey = computed(() => `${props.remoteService}/${props.action}`)

const actionData = computed(() =>
  props.remoteServicesMap[props.remoteService]?.actions[props.action]
)

const inputFields = computed(() => {
  if (!actionData.value?.input || !props.dataset?.schema) return []
  const inputConcepts = new Set(
    actionData.value.input
      .map((i: any) => i.concept)
      .filter(Boolean)
  )
  return props.dataset.schema.filter((field: any) =>
    field['x-refersTo'] &&
    inputConcepts.has(field['x-refersTo']) &&
    field['x-extension'] !== extensionKey.value
  )
})

const outputFields = computed(() => {
  if (!props.dataset?.schema) return []
  return props.dataset.schema.filter((field: any) =>
    field['x-extension'] === extensionKey.value
  )
})

const visibleCols = computed<string[]>(() => [
  ...inputFields.value.map((f: any) => f.key),
  ...outputFields.value.map((f: any) => f.key)
])

const { height: windowHeight } = useWindowSize()
const previewRoot = ref<HTMLElement>()
const tableSentinel = ref<HTMLElement>()
const sentinelTop = ref(200)
const measureSentinel = () => {
  if (tableSentinel.value) sentinelTop.value = tableSentinel.value.getBoundingClientRect().top
}
onMounted(() => {
  nextTick(measureSentinel)
  setTimeout(measureSentinel, 500)
})
watch(windowHeight, () => nextTick(measureSentinel))
useResizeObserver(previewRoot, () => nextTick(measureSentinel))
const tableHeight = computed(() => Math.max(300, windowHeight.value - sentinelTop.value - 96))
</script>
