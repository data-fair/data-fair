<template>
  <div style="position: relative">
    <!--<div
      style="width: 100%; height: 40px"
      d-flex
      flex-row
    >
      <v-text-field />
      <v-spacer />
      <v-btn-group
        variant="outlined"
        divided
        density="compact"
      >
        <dataset-select-cols v-model="cols" />
      </v-btn-group>
    </div>
    -->
    <v-sheet class="pa-0">
      <v-table
        fixed-header
        :loading="fetchResults.loading.value"
        :height="height- 40"
      >
        <thead>
          <tr>
            <th
              v-for="(header, i) of headers"
              :key="header.key"
              class="text-left text-no-wrap"
              :style="`min-width: ${colsWidths[i] ?? 50}px`"
            >
              {{ header.title }}
            </th>
          </tr>
          <tr v-if="fetchResults.loading.value">
            <td
              :colspan="headers?.length"
              style="position: relative"
              class="pa-0"
            >
              <v-progress-linear
                indeterminate
                style="width: 100%; position: absolute; top: 0;"
                color="primary"
                height="3"
              />
            </td>
          </tr>
        </thead>
        <tbody>
          <v-virtual-scroll
            :height="300"
            :items="results"
            :item-height="52"
            renderless
          >
            <template #default="{ item, index }">
              <tr v-intersect:quiet="(intersect: boolean) => intersect && onScrollItem(index)">
                <td
                  v-for="header of headers"
                  :key="header.key"
                  class="text-no-wrap"
                >
                  {{ item[header.key] }}
                </td>
              </tr>
            </template>
          </v-virtual-scroll>
        </tbody>
      </v-table>
    </v-sheet>
  </div>
</template>

<i18n lang="yaml">
</i18n>

<script lang="ts" setup>
import { useCurrentElement } from '@vueuse/core'
import useLines from './use-lines'
import useHeaders from './use-headers'

const { height } = defineProps({ height: { type: Number, default: 800 } })

const { dataset } = useDatasetStore()
// const charsWidths = ref<Record<string, number> | null>(null)

const allCols = computed(() => dataset.value?.schema?.map(p => p.key) ?? [])
const cols = defineModel<string[]>('cols', { default: [] })
const selectedCols = computed(() => cols.value.length ? cols.value : allCols.value)

const displayMode = defineModel<string>('display', { default: 'table' })
const { baseFetchUrl, results, fetchResults } = useLines(displayMode, selectedCols)
const { headers } = useHeaders(selectedCols)

const colsWidths = ref<number[]>([])
const element = useCurrentElement()
watch(baseFetchUrl, () => {
  if (!baseFetchUrl.value) return
  colsWidths.value = []
})
const onScrollItem = (index: number) => {
  if (element.value instanceof HTMLElement) {
    element.value.querySelectorAll('table>thead th').forEach((h, i) => {
      // console.log('H', h.clientWidth)
      colsWidths.value[i] = Math.max(colsWidths.value[i] ?? 50, Math.round(h.clientWidth))
    })
  }
  if (index === results.value.length - 1) {
    // scrolled until the current end of the table
    if (!fetchResults.loading.value) fetchResults.execute()
  }
}
</script>
