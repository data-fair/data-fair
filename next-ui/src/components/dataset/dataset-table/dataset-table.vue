<template>
  <div style="position: relative">
    <!--<chars-measurer
      v-model="charsWidths"
      style="position:absolute; top: 0; z-index: -1;"
    />-->
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
      <!--<v-data-table-virtual
        :items="results"
        :headers="headers"
        :loading="fetchResults.loading.value"
        :height="height- 40"
        item-key="_id"
        item-value="_id"
        fixed-header
        disable-sort
        no-filter
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
      -->
      <v-table
        fixed-header
        :loading="fetchResults.loading.value"
        :height="height- 40"
      >
        <thead>
          <tr>
            <th
              v-for="header of headers"
              :key="header.key"
              class="text-left text-no-wrap"
            >
              {{ header.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <v-virtual-scroll
            :height="300"
            :items="results"
            :item-height="52"
            item-key="_id"
            renderless
          >
            <template #default="{ item, index }">
              <tr>
                <td
                  v-for="header of headers"
                  :key="header.key"
                  class="text-no-wrap"
                >
                  {{ item[header.key] }}
                </td>
              </tr>
              <span
                v-if="index === results.length - 1"
                v-intersect:quiet="onIntersect"
              />
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
const { headers } = useHeaders(selectedCols, baseFetchUrl, results)

const onIntersect = (intersect: boolean) => {
  if (!intersect) return
  if (!fetchResults.loading.value) fetchResults.execute()
}
</script>
