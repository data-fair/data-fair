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
      <v-data-table-virtual
        :items="results"
        :headers="headers"
        :loading="fetchResults.loading.value"
        :height="height- 40"
        item-key="_id"
        item-value="_id"
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
