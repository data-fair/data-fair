<template>
  <div>
    <v-toolbar
      flat
      density="compact"
      color="background"
    >
      <dataset-nb-results
        :total="total"
        :limit="0"
        style="min-width:80px;max-width:80px;"
        class="ml-2"
      />
      <v-text-field
        v-model="editQ"
        placeholder="Rechercher"
        :append-inner-icon="mdiMagnify"
        variant="outlined"
        rounded
        color="primary"
        hide-details
        clearable
        density="compact"
        style="min-width:170px; max-width:250px;"
        class="mx-2"
        @keyup.enter="q = editQ"
        @click:append-inner="q = editQ"
        @click:clear="q = ''"
      />
      <v-spacer />
      <v-btn-group
        divided
        density="compact"
        variant="outlined"
        class="mx-2"
      >
        <dataset-table-select-display
          v-if="display.mdAndUp"
          v-model="displayMode"
        />
        <dataset-select-cols v-model="cols" />
        <dataset-download-results
          v-if="baseFetchUrl && total !== undefined"
          :base-url="baseFetchUrl"
          :total="total"
        />
      </v-btn-group>
    </v-toolbar>
    <v-sheet class="pa-0">
      <v-table
        fixed-header
        :loading="fetchResults.loading.value"
        :height="height- 48"
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
            :item-height="lineHeight"
            renderless
          >
            <template #default="{ item, index }">
              <tr v-intersect:quiet="(intersect: boolean) => intersect && onScrollItem(index)">
                <!--<td
                  v-for="header of headers"
                  :key="header.key"
                  class="text-no-wrap"
                >
                  {{ item.__formatted[header.key] }}
                </td>-->
                <dataset-table-cell
                  v-for="header of headers"
                  :key="header.key"
                  :item="item"
                  :header="header"
                  :no-interaction="noInteraction"
                  :line-height="lineHeight"
                  :table-height="height"
                  :filters="filters"
                  :truncate="truncate"
                  :dense="displayMode === 'table-dense'"
                />
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
import { mdiMagnify } from '@mdi/js'
import { useCurrentElement } from '@vueuse/core'
import useLines from './use-lines'
import useHeaders from './use-headers'
import { useDisplay } from 'vuetify'

const { height, noInteraction } = defineProps({
  height: { type: Number, default: 800 },
  noInteraction: { type: Boolean, default: false },
})

const displayMode = defineModel<string>('display', { default: 'table' })
const cols = defineModel<string[]>('cols', { default: [] })
const q = defineModel<string>('q', { default: '' })
const lineHeight = 52
const filters: any[] = []

const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const display = useDisplay()

const { dataset } = useDatasetStore()
// const charsWidths = ref<Record<string, number> | null>(null)

const allCols = computed(() => dataset.value?.schema?.map(p => p.key) ?? [])
const selectedCols = computed(() => cols.value.length ? cols.value : allCols.value)

const { baseFetchUrl, total, results, fetchResults, truncate } = useLines(displayMode, selectedCols, q, noInteraction)
const { headers } = useHeaders(selectedCols, noInteraction)

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
