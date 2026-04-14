<template>
  <v-toolbar
    v-if="!noInteraction"
    color="surface"
    density="compact"
    flat
  >
    <dataset-nb-results
      :limit="0"
      :total="total"
      class="ml-2"
      style="min-width:80px;max-width:80px;"
    />
    <v-text-field
      v-model="editQ"
      :append-inner-icon="mdiMagnify"
      :max-width="250"
      :min-width="170"
      class="mx-2"
      color="primary"
      density="compact"
      :placeholder="t('search')"
      variant="outlined"
      clearable
      hide-details
      rounded
      @keyup.enter="q = editQ"
      @click:append-inner="q = editQ"
      @click:clear="q = ''"
    />
    <dataset-filters
      v-model="filters"
      class="flex-grow-1"
    />
    <v-spacer />
    <template v-if="pagination">
      <v-btn
        :disabled="!canPrevPage"
        :icon="mdiChevronLeft"
        size="small"
        variant="text"
        @click="paginationPage--"
      />
      <v-btn
        :disabled="!canNextPage || fetchResults.loading.value"
        :icon="mdiChevronRight"
        size="small"
        variant="text"
        @click="nextPage"
      />
    </template>
    <df-agent-chat-action
      action-id="help-filter-table"
      :visible-prompt="t('helpFilterPrompt')"
      :hidden-context="filterHelpContext"
      :btn-props="{ class: 'mx-1' }"
      :title="t('helpFilterPrompt')"
    />
    <df-agent-chat-action
      action-id="check-data-quality"
      :visible-prompt="t('checkDataQualityPrompt')"
      :hidden-context="dataQualityContext"
      :btn-props="{ class: 'mx-1' }"
      :title="t('checkDataQualityPrompt')"
    />
    <v-btn-group
      class="mx-2"
      density="compact"
      variant="outlined"
      divided
    >
      <dataset-table-select-display
        v-if="display.mdAndUp.value"
        v-model="displayMode"
        :edit="edit"
      />
      <dataset-select-cols v-model="cols" />
      <dataset-download-results-menu
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
      :height="pagination ? undefined : height - (noInteraction ? 0 : 48)"
      :loading="fetchResults.loading.value"
      class="dataset-table"
      :fixed-header="!pagination"
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
                  v-if="!selectable"
                  :dense="displayMode === 'table-dense'"
                  :results="results"
                  :selected-cols="selectedCols"
                />
              </div>
              <div
                v-else
                class="pr-2 header-wrapper"
              >
                <span class="two-lines">{{ header.title }}</span>
                <v-icon
                  v-if="header.property && (hoveredHeader?.key === header.key || header.key === sort?.key)"
                  :color="header.key === sort?.key ? 'primary' : 'default'"
                  :icon="header.key === sort?.key ? (sort.direction === 1 ? mdiSortAscending : mdiSortDescending) : mdiMenuDown"
                  class="action-icon"
                />
              </div>
            </th>
            <dataset-table-header-menu
              v-if="header.property && !noInteraction"
              :activator="`#header-${header.cssKey ?? header.key}`"
              :filter-height="height - 20"
              :filters="filters"
              :fixed="fixed === header.key"
              :header="header as TableHeaderWithProperty"
              :no-fix="selectable || edit"
              :sort="header.key === sort?.key ? sort.direction : undefined"
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
            class="pa-0"
            style="position: relative"
          >
            <v-progress-linear
              color="primary"
              height="3"
              style="width: 100%; position: absolute; top: 0;"
              indeterminate
            />
          </td>
        </tr>
      </thead>
      <!-- Infinite scroll mode -->
      <tbody v-if="!pagination">
        <v-virtual-scroll
          ref="virtualScroll"
          :item-height="lineHeight"
          :items="results"
          renderless
        >
          <template #default="{ item, index }">
            <tr v-intersect.quiet="(isIntersecting: boolean) => isIntersecting && onScrollItem(index)">
              <dataset-table-cell
                v-for="header of headers"
                :key="header.key"
                v-model:selected-results="selectedResults"
                :dense="displayMode === 'table-dense'"
                :filter="header.property && findEqFilter(filters, header.property, item)"
                :filters="filters"
                :header="header"
                :hovered="!noInteraction && hovered && hovered[0] === item && (hovered[1] === item.values[header.key] || (Array.isArray(item.values[header.key]) && hovered[1] && (item.values[header.key] as ExtendedResultValue[]).includes(hovered[1]))) ? hovered[1] : undefined"
                :line-height="lineHeight"
                :no-interaction="noInteraction"
                :result="item"
                :selectable="selectable"
                :selected="selectedItem === item._id"
                @hoverstart="hoverStart"
                @hoverstop="hoverStop"
                @show-map-preview="showMapPreview = item._id"
                @show-detail-dialog="showDetailDialog = {result: item, property: header.property}"
                @filter="f => !noInteraction && addFilter(f)"
                @edit="showEditDialog = item"
                @delete="showDeleteDialog = item"
                @select="selectedItem = selectedItem === item._id ? '' : item._id"
              />
            </tr>
          </template>
        </v-virtual-scroll>
      </tbody>
      <!-- Pagination mode -->
      <tbody v-else>
        <tr
          v-for="item in paginatedResults"
          :key="item._id"
        >
          <dataset-table-cell
            v-for="header of headers"
            :key="header.key"
            v-model:selected-results="selectedResults"
            :dense="displayMode === 'table-dense'"
            :filter="header.property && findEqFilter(filters, header.property, item)"
            :filters="filters"
            :header="header"
            :hovered="!noInteraction && hovered && hovered[0] === item && (hovered[1] === item.values[header.key] || (Array.isArray(item.values[header.key]) && hovered[1] && (item.values[header.key] as ExtendedResultValue[]).includes(hovered[1]))) ? hovered[1] : undefined"
            :line-height="lineHeight"
            :no-interaction="noInteraction"
            :result="item"
            :selectable="selectable"
            :selected="selectedItem === item._id"
            @hoverstart="hoverStart"
            @hoverstop="hoverStop"
            @show-map-preview="showMapPreview = item._id"
            @show-detail-dialog="showDetailDialog = {result: item, property: header.property}"
            @filter="f => !noInteraction && addFilter(f)"
            @edit="showEditDialog = item"
            @delete="showDeleteDialog = item"
            @select="selectedItem = selectedItem === item._id ? '' : item._id"
          />
        </tr>
      </tbody>
      <df-scroll-to-top selector=".v-table__wrapper" />
    </v-table>

    <!-- card mode -->
    <div
      v-if="displayMode === 'list' && headers"
      :style="`height: ${height - (noInteraction ? 0 : 48)}px; overflow-y: scroll;overflow-x: hidden;`"
      class="dataset-table-list-wrapper"
    >
      <div style="height:2px;width:100%;">
        <v-progress-linear
          v-if="fetchResults.loading.value"
          height="2"
          style="margin:0;"
          indeterminate
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
          <dataset-table-card
            v-model:sort="sort"
            :filter-height="height - 20"
            :filters="filters"
            :headers="headersWithProperty"
            :hovered="hovered && hovered[0] === result ? hovered[1] : undefined"
            :no-interaction="noInteraction"
            :result="result"
            :selected-fields="selectedCols"
            :truncate="truncate"
            @filter="f => addFilter(f)"
            @hide="header => hideHeader(header)"
            @hoverstart="hoverStart"
            @hoverstop="hoverStop"
            @show-detail-dialog="header => showDetailDialog = {result, property: header.property}"
          />
        </v-col>
      </v-row>

      <!-- list mode show more (infinite scroll only) -->
      <v-row
        v-if="results.length && !pagination"
        v-intersect.quiet="(isIntersecting: boolean) => isIntersecting && fetchResults.execute()"
        align="center"
        class="my-0"
      >
        &nbsp;
      </v-row>
      <df-scroll-to-top selector=".dataset-table-list-wrapper" />
    </div>
  </v-sheet>

  <v-dialog
    :model-value="!!showMapPreview"
    :scrim="false"
    max-width="800"
  >
    <v-card v-if="showMapPreview">
      <v-btn
        :icon="mdiClose"
        style="position:absolute;top:4px;right:4px;z-index:1000;"
        color="primary"
        variant="flat"
        size="small"
        @click="showMapPreview = undefined"
      />
      <async-dataset-map
        :height="mapHeight"
        :no-interaction="true"
        :search="false"
        :selected-item="showMapPreview"
        navigation-position="top-left"
      />
    </v-card>
  </v-dialog>

  <dataset-table-detail-dialog
    v-if="showDetailDialog && showDetailDialog.property"
    :extended-result="showDetailDialog.result"
    :model-value="!!showDetailDialog"
    :property="showDetailDialog.property"
    @update:model-value="showDetailDialog = undefined"
  />

  <v-dialog
    v-if="edit"
    :model-value="!!showDeleteDialog"
    max-width="500"
  >
    <v-card :title="t('deleteLine')">
      <v-card-text>
        <v-alert type="warning">
          {{ t('deleteLineWarning') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="showDeleteDialog = undefined"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :loading="deleteLine.loading.value"
          color="warning"
          variant="flat"
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
    max-width="800"
  >
    <v-card
      :loading="!editedLine"
      :title="t('editLine')"
    >
      <v-form
        ref="editLineForm"
        v-model="editLineValid"
      >
        <v-card-text>
          <async-dataset-edit-line-form
            v-if="editedLine"
            v-model="editedLine"
            :extension="true"
            :loading="editLine.loading.value"
            :ro-primary-key="true"
            :sub-agent="true"
            prefix-name="editLine_"
            :data-title="t('editLine')"
            @on-file-upload="(f: File) => {file = f}"
          />
        </v-card-text>
      </v-form>
      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="showEditDialog = undefined"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :loading="editLine.loading.value"
          color="primary"
          variant="flat"
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
    search: Rechercher
    editLine: Éditer une ligne
    deleteLine: Supprimer une ligne
    deleteLineWarning: Attention, la donnée de cette ligne sera perdue définitivement.
    helpFilterPrompt: Aide-moi à filtrer ces données
    checkDataQualityPrompt: Vérifier la qualité de ces données
  en:
    cancel: Cancel
    delete: Delete
    save: Save
    search: Search
    editLine: Edit a line
    helpFilterPrompt: Help me filter this data
    checkDataQualityPrompt: Check data quality
    deleteLine: Delete a line
    deleteLineWarning: Warning, the data from this line will be lost permanently
</i18n>

<script setup lang="ts">
import type { VVirtualScroll, VForm } from 'vuetify/components'
import { mdiMagnify, mdiSortDescending, mdiSortAscending, mdiMenuDown, mdiClose, mdiChevronLeft, mdiChevronRight } from '@mdi/js'
import useLines, { type ExtendedResultValue, type ExtendedResult } from '../../../composables/dataset/lines'
import useHeaders, { TableHeaderWithProperty, type TableHeader } from './use-headers'
import { provideDatasetEdition } from './use-dataset-edition'
import { useDisplay } from 'vuetify'
import { DatasetLine, type SchemaProperty } from '#api/types'
import { useFilters, findEqFilter } from '../../../composables/dataset/filters'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useAgentTool } from '@data-fair/lib-vue-agents'

const asyncDatasetMap = defineAsyncComponent(() => import('~/components/dataset/map/dataset-map.vue'))
const asyncDatasetTableHeaderActions = defineAsyncComponent(() => import('~/components/dataset/table/dataset-table-header-actions.vue'))
const asyncDatasetEditLineForm = defineAsyncComponent(() => import('~/components/dataset/form/dataset-edit-line-form.vue'))

const { height, noInteraction, edit, selectable, pagination } = defineProps({
  height: { type: Number, default: 800 },
  noInteraction: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  pagination: { type: Boolean, default: false },
})

const displayMode = defineModel<string>('display', { default: 'table' })
const cols = defineModel<string[]>('cols', { default: [] })
const sortStr = defineModel<string>('sort')
const fixed = defineModel<string>('fixed')
const q = defineModel<string>('q', { default: '' })
const selectedItem = defineModel<string>('selectedItem', { default: '' })

const { t } = useI18n()
const onFixCol = (key: string) => {
  if (fixed.value === key) fixed.value = undefined
  else fixed.value = key
}

const lineHeight = computed(() => displayMode.value === 'table-dense' ? 28 : 40)
const pageSize = computed(() => {
  if (pagination) {
    // In pagination mode, fit exactly in visible area to avoid scrollbar
    const toolbarHeight = noInteraction ? 0 : 48
    const theadHeight = displayMode.value === 'table-dense' ? 38 : 50
    const availableHeight = height - toolbarHeight - theadHeight
    return Math.max(5, Math.floor(availableHeight / lineHeight.value))
  }
  return Math.ceil(((height / lineHeight.value) + 4) / 20) * 20
})

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

const { filters, addFilter, queryParams: filtersQueryParams } = useFilters(dataset, { excludeKeys: selectable ? ['_id_eq'] : [] })

const filterHelpContext = computed(() => {
  const d = dataset.value
  if (!d) return ''
  const activeFilters = filters.value.map(f => `${f.property.title || f.property.key} ${f.operator} ${f.formattedValue || f.value}`).join(', ')
  return `The user is viewing the table page of dataset "${d.title}" (id: ${d.id}).${activeFilters ? ` Active filters: ${activeFilters}.` : ' No filters are currently applied.'} Ask the user what data they want to see or filter before using the data exploration subagent. After exploring, use the navigate tool to apply filters to this table page: the dataset_data subagent includes in its Context a filterQuery (URL query string) and columns (relevant column keys). Use the filterQuery as the query parameter of the navigate tool, adding select=col1,col2,col3 from the columns keys.`
})

const dataQualityContext = computed(() => {
  const d = dataset.value
  if (!d) return ''
  return `The user is viewing the table page of dataset "${d.title}" (id: ${d.id}). They clicked the "Check data quality" button. Before running the data_quality_checker subagent, ask the user if they want a full quality analysis or if they want to focus on specific aspects (completeness, duplicates, outliers, or format issues). Once the user confirms, dispatch the data_quality_checker subagent with the dataset ID.`
})

const conceptFilters = useConceptFilters(useReactiveSearchParams())
const extraParams = computed(() => ({ ...filtersQueryParams.value, ...conceptFilters }))
const indexedAt = ref<string>()
const { baseFetchUrl, total, next, results, fetchResults, truncate } = useLines(displayMode, pageSize, selectedCols, q, sortStr, extraParams, indexedAt)

// Pagination mode: slice results into pages, fetch more via next when needed
const paginationPage = ref(0)
const paginatedResults = computed(() => results.value.slice(paginationPage.value * pageSize.value, (paginationPage.value + 1) * pageSize.value))
const canPrevPage = computed(() => paginationPage.value > 0)
const canNextPage = computed(() => (paginationPage.value + 1) * pageSize.value < results.value.length || !!next.value)
const nextPage = async () => {
  const end = (paginationPage.value + 1) * pageSize.value
  if (end >= results.value.length && next.value) {
    await fetchResults.execute()
  }
  paginationPage.value++
}
const { headers, headersWithProperty } = useHeaders(selectedCols, noInteraction, edit, selectable, fixed)
const { selectedResults, saveLine, bulkLines, addLineTrigger } = provideDatasetEdition(baseFetchUrl, indexedAt)

if (edit) {
  useAgentTool({
    name: 'open_add_line_dialog',
    description: 'Open the "Add a new line" dialog on the data editing page. After opening, delegate to the editLine_form subagent to fill the form fields (it becomes available once the dialog opens). The user will click Save manually.',
    annotations: { title: 'Ouvrir le dialogue d\'ajout de ligne', readOnlyHint: false },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      addLineTrigger.value = true
      return 'Add line dialog opened. You can now delegate to the editLine_form subagent to fill in the form fields. The user will click Save when ready.'
    }
  })

  useAgentTool({
    name: 'open_edit_line_dialog',
    description: 'Open the "Edit line" dialog for a specific data row. Provide the line _id. After opening, delegate to the editLine_form subagent to modify form fields (it becomes available once the dialog opens). The user will click Save manually.',
    annotations: { title: 'Ouvrir le dialogue d\'édition de ligne', readOnlyHint: false },
    inputSchema: {
      type: 'object' as const,
      properties: {
        lineId: { type: 'string' as const, description: 'The _id of the line to edit. Use search_data to find valid line IDs.' }
      },
      required: ['lineId'] as const
    },
    execute: async (params: { lineId: string }) => {
      showEditDialog.value = { _id: params.lineId } as ExtendedResult
      return 'Edit line dialog opened. You can now delegate to the editLine_form subagent to modify the form fields. The user will click Save when ready.'
    }
  })
}

const virtualScroll = ref<VVirtualScroll>()
const colsWidths = ref<number[]>([])
const thead = ref<HTMLElement>()
const minColWidth = computed(() => {
  return displayMode.value === 'table-dense' ? 80 : 120
})
const incColsWidth = async () => {
  thead.value?.querySelectorAll('th').forEach((h, i) => {
    colsWidths.value[i] = Math.max(colsWidths.value[i] ?? minColWidth.value, Math.round(h.clientWidth))
  })
}
watch(displayMode, () => { colsWidths.value = [] })
watch(selectedCols, () => { colsWidths.value = [] })

watch(baseFetchUrl, () => {
  if (!baseFetchUrl.value) return
  // colsWidths.value = []
  paginationPage.value = 0
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
