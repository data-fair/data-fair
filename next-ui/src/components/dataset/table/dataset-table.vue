<template>
  <v-toolbar
    flat
    density="compact"
    color="surface"
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
    <dataset-filters
      v-model="filters"
      class="flex-grow-1"
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
      v-if="displayMode === 'table' || displayMode === 'table-dense'"
      fixed-header
      :loading="fetchResults.loading.value"
      :height="height- 48"
      class="dataset-table"
    >
      <thead ref="thead">
        <tr>
          <template
            v-for="(header, i) of headers"
            :key="header.key"
          >
            <th
              :id="`header-${header.key}`"
              class="text-left"
              :class="{
                'sticky': header.sticky,
                'bg-surface': header.sticky,
                'border-e-thin': header.sticky,
                'pr-2': header.sticky,
                'pl-2': displayMode === 'table-dense'
              }"
              :style="{
                'min-width': (colsWidths[i] ?? 50) + 'px',
                cursor: header.property && !noInteraction ? 'pointer' : 'default',
              }"
              @mouseenter="hoveredHeader = header"
              @mouseleave="hoveredHeader = undefined"
            >
              <div
                v-if="header.key === '_actions'"
                class="header-wrapper"
              >
                <dataset-table-header-actions
                  v-model:selected-results="selectedResults"
                  :results="results"
                />
              </div>
              <div
                v-else
                class="pr-2 header-wrapper"
              >
                <span class="two-lines">{{ header.title }}</span>
                <v-icon
                  v-if="header.property && (hoveredHeader?.key === header.key || header.key === sort?.key)"
                  class="action-icon"
                  :color="header.key === sort?.key ? 'primary' : 'default'"
                  :icon="header.key === sort?.key ? (sort.direction === 1 ? mdiSortAscending : mdiSortDescending) : mdiMenuDown"
                />
              </div>
            </th>
            <dataset-table-header-menu
              v-if="header.property && !noInteraction"
              :sort="header.key === sort?.key ? sort.direction : undefined"
              :activator="`#header-${header.key}`"
              :header="header"
              :filters="filters"
              :filter-height="height - 20"
              @filter="addFilter"
              @hide="hideHeader(header)"
              @fix-col="fixed = header.key"
              @update:sort="(direction: 1 | -1 | undefined) => {sort = direction ? {direction, key: header.key} : undefined}"
            />
          </template>
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
          ref="virtualScroll"
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
                v-model:selected-results="selectedResults"
                :result="item"
                :header="header"
                :no-interaction="noInteraction"
                :line-height="lineHeight"
                :filters="filters"
                :dense="displayMode === 'table-dense'"
                :map-preview-height="mapPreviewHeight"
                :hovered="hovered && hovered[0] === item && (hovered[1] === item.values[header.key] || (Array.isArray(item.values[header.key]) && hovered[1] && (item.values[header.key] as ExtendedResultValue[]).includes(hovered[1]))) ? hovered[1] : undefined"
                :filter="findEqFilter(filters, header.property, item)"
                @hoverstart="hoverStart"
                @hoverstop="hoverStop"
                @show-map-preview="showMapPreview = item._id"
                @show-detail-dialog="v => showDetailDialog = {result: item, property: header.property}"
                @filter="f => addFilter(f)"
              />
            </tr>
          </template>
        </v-virtual-scroll>
      </tbody>
    </v-table>

    <!--list mode body -->
    <template v-if="displayMode === 'list' && headers">
      <div style="height:2px;width:100%;">
        <v-progress-linear
          v-if="fetchResults.loading.value"
          indeterminate
          height="2"
          style="margin:0;"
        />
      </div>

      <v-row
        class="ma-0"
        dense
      >
        <v-col
          v-for="result in results"
          :key="result._id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <dataset-item-card
            :result="result"
            :filters="filters"
            :filter-height="height - 20"
            :selected-fields="selectedCols"
            :headers="headers"
            :truncate="truncate"
            :sort="sort"
            :no-interaction="noInteraction"
            :hovered="hovered && hovered[0] === result ? hovered[1] : undefined"
            @filter="f => addFilter(f)"
            @hide="header => hideHeader(header)"
            @hoverstart="hoverStart"
            @hoverstop="hoverStop"
            @show-detail-dialog="header => showDetailDialog = {result, property: header.property}"
          />
        </v-col>
      </v-row>

      <!-- list mode show more -->
      <v-row
        v-if="results.length"
        v-intersect:quiet="(intersect: boolean) => intersect && fetchResults.execute()"
        align="center"
        class="my-0"
      >
        &nbsp;
      </v-row>
      <layout-scroll-to-top />
    </template>
  </v-sheet>

  <v-dialog
    :model-value="!!showMapPreview"
    max-width="700"
    :scrim="false"
  >
    <v-card
      v-if="showMapPreview"
    >
      <v-btn
        style="position:absolute;top:4px;right:4px;z-index:1000;"
        :icon="mdiClose"
        @click="showMapPreview = undefined"
      />
      <async-dataset-map
        :height="mapHeight"
        navigation-position="top-left"
        :single-item="showMapPreview"
      />
    </v-card>
  </v-dialog>

  <dataset-item-detail-dialog
    v-if="showDetailDialog"
    :model-value="!!showDetailDialog"
    :extended-result="showDetailDialog.result"
    :property="showDetailDialog.property"
    @update:model-value="showDetailDialog = undefined"
  />
</template>

<i18n lang="yaml">
</i18n>

<script lang="ts" setup>
import { mdiMagnify, mdiSortDescending, mdiSortAscending, mdiMenuDown, mdiClose } from '@mdi/js'
import useLines, { type ExtendedResultValue, type ExtendedResult } from '../../../composables/dataset-lines'
import useHeaders, { type TableHeader } from './use-headers'
import useEdition from './use-edition'
import { useDisplay } from 'vuetify'
import { type SchemaProperty } from '#api/types'
import { useFilters, findEqFilter } from '../../../composables/dataset-filters'
import { VVirtualScroll } from 'vuetify/components'

const asyncDatasetMap = defineAsyncComponent(() => import('~/components/dataset/map/dataset-map.vue'))

const { height, noInteraction, edit } = defineProps({
  height: { type: Number, default: 800 },
  noInteraction: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
})

const displayMode = defineModel<string>('display', { default: 'table' })
const cols = defineModel<string[]>('cols', { default: [] })
const sortStr = defineModel<string>('sort')
const fixed = defineModel<string>('fixed')
const q = defineModel<string>('q', { default: '' })

const lineHeight = computed(() => displayMode.value === 'table-dense' ? 28 : 40)
const mapPreviewHeight = computed(() => {
  return Math.max(400, Math.min(700, height * 0.8))
})

const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const sort = computed<{ key: string, direction: 1 | -1 } | undefined>({
  get () {
    if (!sortStr.value) return undefined
    if (sortStr.value.startsWith('-')) return { direction: 1, key: sortStr.value.slice(1) }
    return { direction: 1, key: sortStr.value }
  },
  set (v) {
    if (!v) sortStr.value = undefined
    else sortStr.value = (v.direction === -1 ? '-' : '') + v.key
  }
})

const display = useDisplay()

const { dataset } = useDatasetStore()
// const charsWidths = ref<Record<string, number> | null>(null)

const allCols = computed(() => dataset.value?.schema?.map(p => p.key) ?? [])
const selectedCols = computed(() => cols.value.length ? cols.value : allCols.value)

const { filters, addFilter, queryParams: filtersQueryParams } = useFilters()
const conceptFilters = useConceptFilters(useReactiveSearchParams())
const extraParams = computed(() => ({ ...filtersQueryParams.value, ...conceptFilters }))
const { baseFetchUrl, total, results, fetchResults, truncate } = useLines(displayMode, selectedCols, q, sortStr, extraParams)
const { headers, hideHeader } = useHeaders(selectedCols, noInteraction, edit, fixed)
const { selectedResults } = useEdition(baseFetchUrl)

const virtualScroll = ref<VVirtualScroll>()
const colsWidths = ref<number[]>([])
const thead = ref<HTMLElement>()
watch(baseFetchUrl, () => {
  if (!baseFetchUrl.value) return
  colsWidths.value = []
  virtualScroll.value?.scrollToIndex(0)
})
const onScrollItem = (index: number) => {
  // ignore scroll on deprecated items that will soon be replaced
  if (fetchResults.loading.value) return
  thead.value?.querySelectorAll('table thead th').forEach((h, i) => {
    colsWidths.value[i] = Math.max(colsWidths.value[i] ?? 50, Math.round(h.clientWidth))
  })
  if (index === results.value.length - 1) {
    // scrolled until the current end of the table
    if (!fetchResults.loading.value) fetchResults.execute()
  }
}

const hovered = ref<[ExtendedResult, ExtendedResultValue]>()
let _hoverTimeout: ReturnType<typeof setTimeout> | undefined
const hoverStart = (result: ExtendedResult, value: ExtendedResultValue) => {
  _hoverTimeout = setTimeout(() => { hovered.value = [result, value] }, 60)
}

const hoverStop = () => {
  if (_hoverTimeout) {
    clearTimeout(_hoverTimeout)
    _hoverTimeout = undefined
  }
  hovered.value = undefined
}

const hoveredHeader = ref<TableHeader>()

const mapHeight = computed(() => {
  return Math.max(400, Math.min(700, height * 0.8))
})
const showMapPreview = ref<string>()

const showDetailDialog = ref<{ result: ExtendedResult, property: SchemaProperty }>()
</script>

<style>
.dataset-table th {
  z-index: 2;
}
.dataset-table .header-wrapper {
  position: relative;
  width: 100%;
}
.dataset-table .header-wrapper .action-icon {
  position: absolute;
  right: -14px;
  top: 50%;
  transform: translateY(-50%);
}
.dataset-table th.sticky {
  position: sticky;
  left: 0;
  z-index: 3;
}
.dataset-table th.sticky .action-icon {
  right: -4px;
}
.two-lines {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
</style>
