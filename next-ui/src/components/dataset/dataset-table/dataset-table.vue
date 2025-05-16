<template>
  <div style="position: relative">
    <char-sizes
      v-model="chars"
      style="position:absolute; top: 0; z-index: -1;"
    />
    <v-sheet class="pa-0">
      <v-data-table-virtual
        :height="windowHeight"
        :items="results"
        :headers="headers"
        :loading="fetchResults.loading.value"
        fixed-header
      >
        <template #loader>
          <v-progress-linear
            indeterminate
            color="primary"
          />
        </template>
        <template #body.append>
          <span v-intersect:quiet="onIntersect" />
        </template>
      </v-data-table-virtual>
    </v-sheet>
  </div>
</template>

<i18n lang="yaml">
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import useLines from './use-lines'

const { dataset } = useDatasetStore()
const { results, fetchResults } = useLines()

const chars = ref<Record<string, number> | null>(null)

const { height: windowHeight } = useWindowSize()

const headers = computed(() => {
  return dataset.value?.schema?.map(p => ({
    key: p.key,
    title: p.title || p['x-originalName'] || p.key,
    nowrap: true
  }))
})

const onIntersect = (intersect: boolean) => {
  if (!intersect) return
  if (!fetchResults.loading.value) fetchResults.execute()
}
</script>
