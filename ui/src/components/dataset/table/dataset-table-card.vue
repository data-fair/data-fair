<!--
  Card component used by dataset-table in 'list' display mode (card layout).
  Each result is rendered as a v-card with its fields listed vertically.
-->
<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    class="fill-height dataset-table-card"
    :class="{'dataset-table-card--selected': selected}"
    variant="outlined"
  >
    <div
      v-if="selectable || label || result._thumbnail || showMapBtn"
      class="d-flex align-center ga-2 pa-2 pb-0"
    >
      <v-btn
        v-if="selectable"
        :icon="selected ? mdiCheckboxMarked : mdiCheckboxBlankOutline"
        :title="selected ? t('unselectLine') : t('selectLine')"
        :color="selected ? 'primary' : undefined"
        density="compact"
        variant="text"
        @click="emit('select')"
      />
      <v-avatar
        v-if="result._thumbnail"
        rounded="sm"
      >
        <img :src="result._thumbnail">
      </v-avatar>
      <span
        v-if="label"
        class="text-title-medium font-weight-bold"
      >{{ label }}</span>
      <v-btn
        v-if="showMapBtn"
        :icon="mdiMap"
        :title="t('showMapPreview')"
        class="ms-auto"
        density="compact"
        size="small"
        variant="text"
        @click="emit('showMapPreview')"
      />
    </div>
    <v-card-text class="py-0 px-2">
      <div
        v-if="result._highlight && result._highlight['_file.content'] && result._highlight['_file.content'][0]"
        v-html="result._highlight['_file.content'][0].replace(/highlighted/g,'accent--text')"
      />
      <!--<div
        v-if="descriptionField && result.values[descriptionField.key]"
        :inner-html.prop="(result.values[descriptionField.key] + '')"
      />-->
      <v-list
        density="compact"
        class="bg-transparent pt-0"
      >
        <template
          v-for="header in otherHeaders"
          :key="`input-${header.key}`"
        >
          <div
            :style="showHeaderMenu ? 'cursor:pointer' : ''"
            @mouseenter="!Array.isArray(result.values[header.key]) && emit('hoverstart', result, markRaw(result.values[header.key] as ExtendedResultValue))"
            @mouseleave="emit('hoverstop')"
          >
            <div class="text-body-small mt-2">
              {{ header.title }}
            </div>
            <div style="position: relative;">
              <dataset-table-value-multiple
                v-if="Array.isArray(result.values[header.key])"
                :values="result.values[header.key] as ExtendedResultValue[]"
                :property="header.property"
                :dense="true"
                :hovered="hovered"
                :filter="findEqFilter(filters, header.property, result)"
                :no-interaction="noInteraction"
                :no-filter="noFilter"
                @filter="v => emit('filter', {property: header.property, operator: 'eq', value: v.raw + '', formattedValue: v.formatted})"
                @hoverstart="v => emit('hoverstart', result, v)"
                @hoverstop="emit('hoverstop')"
              />
              <dataset-table-value
                v-else
                :class="{'text-truncate': isGeometry(header)}"
                :value="result.values[header.key] as ExtendedResultValue"
                :property="header.property"
                :filtered="!!findEqFilter(filters, header.property, result)"
                :dense="true"
                @filter="emit('filter', {property: header.property, operator: 'eq', value: (result.values[header.key] as ExtendedResultValue).raw + '', formattedValue: (result.values[header.key] as ExtendedResultValue).formatted})"
                @show-detail-dialog="emit('showDetailDialog', header)"
              />
              <div
                v-if="hovered === result.values[header.key]"
                class="item-value-hover-actions"
              >
                <v-btn
                  v-if="!noInteraction && (result.values[header.key] as ExtendedResultValue).formatted && ((result.values[header.key] as ExtendedResultValue).displayDetail || isGeometry(header))"
                  :icon="mdiLoupe"
                  :title="t('showFullValue')"
                  color="primary"
                  density="comfortable"
                  size="x-small"
                  variant="flat"
                  @click.stop="emit('showDetailDialog', header)"
                />
                <!-- no handler: the click reaches the value, which opens the column menu -->
                <v-btn
                  v-if="showHeaderMenu"
                  :icon="mdiChevronDown"
                  :title="t('openMenu')"
                  color="primary"
                  density="comfortable"
                  size="x-small"
                  variant="flat"
                />
              </div>
              <v-icon
                v-else-if="sort && sort.key === header.key"
                :icon="sort.direction === 1 ? mdiSortAscending : mdiSortDescending"
                color="primary"
                class="item-value-hover-actions"
              />
            </div>
            <dataset-table-header-menu
              v-if="showHeaderMenu"
              activator="parent"
              :header="header"
              :filters="filters"
              :no-filter="noFilter"
              :no-sort="noSort"
              :no-cols="noCols"
              :filter-height="filterHeight"
              :sort="header.key === sort?.key ? sort.direction : undefined"
              no-fix
              close-on-filter
              :local-enum="([] as ExtendedResultValue[]).concat(result.values[header.key]).filter(v => v.filterable).map(v => v.raw)"
              @filter="filter => emit('filter', filter)"
              @hide="$emit('hide', header)"
              @update:sort="direction => {sort = direction ? {direction, key: header.key} : undefined}"
            >
              <template #prepend-items="{hide}">
                <v-list-item
                  v-if="(result.values[header.key] as ExtendedResultValue).displayDetail"
                  class="pl-2"
                  :icon="mdiMagnifyPlus"
                  :title="t('showFullValue')"
                  @click="emit('showDetailDialog', header); hide()"
                />
              </template>
            </dataset-table-header-menu>
          </div>
        </template>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
  fr:
    showFullValue: Afficher la valeur entière
    selectLine: Sélectionner la ligne
    unselectLine: Désélectionner la ligne
    showMapPreview: Voir sur une carte
    openMenu: Trier, filtrer ou masquer cette colonne
  en:
    showFullValue: Show full value
    selectLine: Select the line
    unselectLine: Deselect the line
    showMapPreview: Show on a map
    openMenu: Sort, filter or hide this column
  </i18n>

<script setup lang="ts">
import { type DatasetFilter } from '~/composables/dataset/filters'
import { type ExtendedResult, type ExtendedResultValue } from '~/composables/dataset/lines'
import { type TableHeaderWithProperty, type TableSort } from './use-headers'
import { findEqFilter } from '~/composables/dataset/filters'
import { mdiSortAscending, mdiSortDescending, mdiChevronDown, mdiLoupe, mdiMagnifyPlus, mdiCheckboxMarked, mdiCheckboxBlankOutline, mdiMap } from '@mdi/js'

const { result, headers, noSort, noFilter, noCols, noInteraction, mapPreview } = defineProps({
  result: { type: Object as () => ExtendedResult, required: true },
  filters: { type: Array as () => DatasetFilter[], required: false, default: () => ([]) },
  filterHeight: { type: Number, required: true },
  headers: { type: Array as () => TableHeaderWithProperty[], required: true },
  truncate: { type: Number, default: 50 },
  noFilter: { type: Boolean, default: false },
  noSort: { type: Boolean, default: false },
  noCols: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false },
  hovered: { type: Object as () => ExtendedResultValue, default: null },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  mapPreview: { type: Boolean, default: false }
})

const sort = defineModel<TableSort>('sort')

const emit = defineEmits<{
  hide: [header: TableHeaderWithProperty],
  filter: [filter: DatasetFilter],
  hoverstart: [result: ExtendedResult, value: ExtendedResultValue],
  hoverstop: [],
  showMapPreview: [],
  showDetailDialog: [header: TableHeaderWithProperty],
  select: []
}>()

// the header menu is only worth opening if at least one of its sections is active
const showHeaderMenu = computed(() => !noSort || !noFilter || !noCols)

const { t } = useI18n()
const { labelField, imageField } = useDatasetStore()

const label = computed(() => {
  const value = labelField.value && result.values[labelField.value.key]
  return value && !Array.isArray(value) ? value.formatted : undefined
})

const showMapBtn = computed(() => mapPreview && !!result._geopoint)

const isGeometry = (header: TableHeaderWithProperty) => header.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry'

// label and image are already shown in the card header
const otherHeaders = computed(() => headers.filter(h => h.property && h.key !== labelField.value?.key && h.key !== imageField.value?.key))
</script>

<style>

.dataset-table-card--selected {
  border-color: rgb(var(--v-theme-primary));
}

.dataset-table-card .v-input__slot {
  display: block;
  overflow: hidden;
  text-overflow:ellipsis;
}

.dataset-table-card .v-input__slot .v-label {
  font-size:12px;
  line-height: 16px;
  height: 16px;
  bottom: -2px;
  white-space:nowrap;
}

</style>
