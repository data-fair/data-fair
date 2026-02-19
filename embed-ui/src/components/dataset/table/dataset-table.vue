<template>
  <v-toolbar
    v-if="!noInteraction"
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
        v-if="display.mdAndUp.value"
        v-model="displayMode"
        :edit="edit"
      />
      <dataset-select-cols v-model="cols" />
      <dataset-download-results
        v-if="baseFetchUrl && total !== undefined"
        :base-url="baseFetchUrl"
        :selected-cols="cols"
        :total="total"
      />
    </v-btn-group>
  </v-toolbar>
  <v-sheet class="pa-0">
    <v-table
      v-if="displayMode === 'table' || displayMode === 'table-dense'"
      fixed-header
      :loading="fetchResults.loading.value"
      :height="height - (noInteraction ? 0 : 48)"
      class="dataset-table"
    >
      <thead ref="thead">
        <tr>
          <template
            v-for="(header, i) of headers"
            :key="header.key"
          >
            <th
              :id="`header-${header.cssKey ?? header.key}`"
              :title="header.title"
              class="text-left"
              :class="{
                'sticky': header.sticky,
                'bg-surface': header.sticky,
                'border-e-thin': header.sticky,
                'pr-2': header.sticky,
                'pl-2': displayMode === 'table-dense'
              }"
              :style="{
                'min-width': header.property ? (colsWidths[i] ?? minColWidth) + 'px' : '',
                cursor: header.property && !noInteraction ? 'pointer' : 'default',
              }"
              @mouseenter="hoveredHeader = noInteraction ? undefined : header"
              @mouseleave="hoveredHeader = undefined"
            >
              <div
                v-if="header.key === '_actions'"
                class="header-wrapper"
              >
                <async-dataset-table-header-actions
                  :results="results"
                  :selected-cols="selectedCols"
                  :dense="displayMode === 'table-dense'"
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
              :activator="`#header-${header.cssKey ?? header.key}`"
              :header="header as TableHeaderWithProperty"
              :filters="filters"
              :filter-height="height - 20"
              :fixed="fixed === header.key"
              @filter="addFilter"
              @hide="hideHeader(header)"
              @fix-col="onFixCol(header.key)"
              @update:sort="direction => {sort = direction ? {direction, key: header.key} : undefined}"
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
                :hovered="!noInteraction && hovered && hovered[0] === item && (hovered[1] === item.values[header.key] || (Array.isArray(item.values[header.key]) && hovered[1] && (item.values[header.key] as ExtendedResultValue[]).includes(hovered[1]))) ? hovered[1] : undefined"
                :filter="header.property && findEqFilter(filters, header.property, item)"
                @hoverstart="hoverStart"
                @hoverstop="hoverStop"
                @show-map-preview="showMapPreview = item._id"
                @show-detail-dialog="showDetailDialog = {result: item, property: header.property}"
                @filter="f => !noInteraction && addFilter(f)"
                @edit="showEditDialog = item"
                @delete="showDeleteDialog = item"
              />
            </tr>
          </template>
        </v-virtual-scroll>
      </tbody>
      <layout-scroll-to-top selector=".v-table__wrapper" />
    </v-table>

    <!--list mode body -->
    <div
      v-if="displayMode === 'list' && headers"
      :style="`height: ${height - (noInteraction ? 0 : 48)}px; overflow-y: scroll;overflow-x: hidden;`"
      class="dataset-table-list-wrapper"
    >
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
            v-model:sort="sort"
            :result="result"
            :filters="filters"
            :filter-height="height - 20"
            :selected-fields="selectedCols"
            :headers="headersWithProperty"
            :truncate="truncate"
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
      <layout-scroll-to-top selector=".dataset-table-list-wrapper" />
    </div>
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
        variant="text"
        @click="showMapPreview = undefined"
      />
      <async-dataset-map
        :height="mapHeight"
        navigation-position="top-left"
        :search="false"
        :selected-item="showMapPreview"
        :no-interaction="true"
      />
    </v-card>
  </v-dialog>

  <dataset-item-detail-dialog
    v-if="showDetailDialog && showDetailDialog.property"
    :model-value="!!showDetailDialog"
    :extended-result="showDetailDialog.result"
    :property="showDetailDialog.property"
    @update:model-value="showDetailDialog = undefined"
  />

  <v-dialog
    v-if="edit"
    :model-value="!!showDeleteDialog"
    max-width="500px"
  >
    <v-card :title="t('deleteLine')">
      <v-card-text>
        <v-alert
          :value="true"
          type="warning"
        >
          {{ t('deleteLineWarning') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDeleteDialog = undefined"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :loading="deleteLine.loading.value"
          @click="deleteLine.execute()"
        >
          {{ t('delete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-if="edit"
    :model-value="!!showEditDialog"
    max-width="700px"
  >
    <v-card
      :title="t('editLine')"
      :loading="!editedLine"
    >
      <v-form
        ref="editLineForm"
        v-model="editLineValid"
      >
        <v-card-text>
          <async-dataset-edit-line-form
            v-if="editedLine"
            v-model="editedLine"
            :loading="editLine.loading.value"
            :extension="true"
            :ro-primary-key="true"
            @on-file-upload="(f: File) => {file = f}"
          />
        </v-card-text>
      </v-form>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showEditDialog = undefined"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="editLine.loading.value"
          @click="editLine.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    cancel: Annuler
    delete: Supprimer
    save: Enregistrer
    editLine: Éditer une ligne
    deleteLine: Supprimer une ligne
    deleteLineWarning: Attention, la donnée de cette ligne sera perdue définitivement.
  en:
    cancel: Cancel
    delete: Delete
    save: Save
    editLine: Edit a line
    deleteLine: Delete a line
    deleteLineWarning: Warning, the data from this line will be lost definitively
</i18n>

<script lang="ts" setup>
import { mdiMagnify, mdiSortDescending, mdiSortAscending, mdiMenuDown, mdiClose } from '@mdi/js'
import useLines, { type ExtendedResultValue, type ExtendedResult } from '../../../composables/dataset-lines'
import useHeaders, { TableHeaderWithProperty, type TableHeader } from './use-headers'
import { provideDatasetEdition } from './use-dataset-edition'
import { useDisplay } from 'vuetify'
import { DatasetLine, type SchemaProperty } from '#api/types'
import { useFilters, findEqFilter } from '../../../composables/dataset-filters'
import { type VVirtualScroll, type VForm } from 'vuetify/components'

const asyncDatasetMap = defineAsyncComponent(() => import('~/components/dataset/map/dataset-map.vue'))
const asyncDatasetTableHeaderActions = defineAsyncComponent(() => import('~/components/dataset/table/dataset-table-header-actions.vue'))
const asyncDatasetEditLineForm = defineAsyncComponent(() => import('~/components/dataset/form/dataset-edit-line-form.vue'))

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

const { t } = useI18n()

const onFixCol = (key: string) => {
  if (fixed.value === key) fixed.value = undefined
  else fixed.value = key
}

const lineHeight = computed(() => displayMode.value === 'table-dense' ? 28 : 40)
const mapPreviewHeight = computed(() => {
  return Math.max(400, Math.min(700, height * 0.8))
})
const pageSize = computed(() => Math.ceil(((height / lineHeight.value) + 4) / 20) * 20)

const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const sort = computed<{ key: string, direction: 1 | -1 } | undefined>({
  get () {
    if (!sortStr.value) return undefined
    if (sortStr.value.startsWith('-')) return { direction: -1, key: sortStr.value.slice(1) }
    return { direction: 1, key: sortStr.value }
  },
  set (v) {
    if (!v) sortStr.value = undefined
    else sortStr.value = (v.direction === -1 ? '-' : '') + v.key
  }
})

const display = useDisplay()

const { dataset, id: datasetId } = useDatasetStore()
// const charsWidths = ref<Record<string, number> | null>(null)

const allCols = computed(() => dataset.value?.schema?.filter(field => !field['x-calculated'] || field.key === '_updatedAt' || field.key === '_updatedByName').map(p => p.key) ?? [])
const selectedCols = computed(() => cols.value.length ? cols.value : allCols.value)

const hideHeader = (header: TableHeader) => {
  let newCols = cols.value
  if (!cols.value.length) {
    newCols = [...allCols.value]
  }
  cols.value = newCols.filter(col => col !== header.key)
}

const { filters, addFilter, queryParams: filtersQueryParams } = useFilters()
const conceptFilters = useConceptFilters(useReactiveSearchParams())
const extraParams = computed(() => ({ ...filtersQueryParams.value, ...conceptFilters }))
const indexedAt = ref<string>()
const { baseFetchUrl, total, results, fetchResults, truncate } = useLines(displayMode, pageSize, selectedCols, q, sortStr, extraParams, indexedAt)
const { headers, headersWithProperty } = useHeaders(selectedCols, noInteraction, edit, fixed)
const { selectedResults, saveLine, bulkLines } = provideDatasetEdition(baseFetchUrl, indexedAt)

const virtualScroll = ref<VVirtualScroll>()
const colsWidths = ref<number[]>([])
const thead = ref<HTMLElement>()
const minColWidth = computed(() => {
  return displayMode.value === 'table-dense' ? 80 : 120
})
const incColsWidth = async () => {
  thead.value?.querySelectorAll('table thead th').forEach((h, i) => {
    colsWidths.value[i] = Math.max(colsWidths.value[i] ?? minColWidth.value, Math.round(h.clientWidth))
  })
}
watch(displayMode, () => { colsWidths.value = [] })
watch(selectedCols, () => { colsWidths.value = [] })

watch(baseFetchUrl, () => {
  if (!baseFetchUrl.value) return
  // colsWidths.value = []
  virtualScroll.value?.scrollToIndex(0)
})
const onScrollItem = async (index: number) => {
  // ignore scroll on deprecated items that will soon be replaced
  if (fetchResults.loading.value) return
  incColsWidth()
  if (index === results.value.length - 1) {
    // scrolled until the current end of the table
    if (!fetchResults.loading.value) fetchResults.execute()
  }
}

const hovered = ref<[ExtendedResult, ExtendedResultValue]>()
let _hoverTimeout: ReturnType<typeof setTimeout> | undefined
const hoverStart = (result: ExtendedResult, value: ExtendedResultValue) => {
  if (noInteraction) return
  _hoverTimeout = setTimeout(() => { hovered.value = [result, value] }, 60)
}

const hoverStop = () => {
  if (noInteraction) return
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

const showDetailDialog = ref<{ result: ExtendedResult, property?: SchemaProperty }>()

const showEditDialog = ref<ExtendedResult>()
watch(showEditDialog, async () => {
  editedLine.value = undefined
  if (!showEditDialog.value) return
  editedLine.value = await $fetch(`datasets/${datasetId}/lines/${showEditDialog.value._id}`, { params: { arrays: true } })
  // JSON.parse(JSON.stringify(showEditDialog.value.raw))
  file.value = undefined
})
const editLineValid = ref(false)
const editLineForm = ref<VForm>()
const editedLine = ref<DatasetLine>()
const file = ref<File>()
const editLine = useAsyncAction(async () => {
  await editLineForm.value?.validate()
  if (!editLineValid.value) return
  await saveLine({ _id: showEditDialog.value?._id, ...editedLine.value }, file.value)
  showEditDialog.value = undefined
})

const showDeleteDialog = ref<ExtendedResult>()
const deleteLine = useAsyncAction(async () => {
  if (!showDeleteDialog.value) return
  await bulkLines([{ _action: 'delete', _id: showDeleteDialog.value._id }])
  showDeleteDialog.value = undefined
})
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
