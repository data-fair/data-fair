<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    class="fill-height dataset-item-card"
    variant="outlined"
  >
    <v-card-title
      v-if="labelField || result._thumbnail"
      class="pb-0"
    >
      <v-row class="ma-0">
        <v-avatar
          v-if="result._thumbnail"
          tile
          style="position:relative;top:-12px;left:-12px;"
        >
          <img :src="result._thumbnail">
        </v-avatar>
        <h5
          v-if="labelField && result.values[labelField.key] && !Array.isArray(result.values[labelField.key])"
          style="word-break: normal;line-height:18px"
        >
          {{ (result.values[labelField.key] as ExtendedResultValue).formatted }}
        </h5>
      </v-row>
    </v-card-title>
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
          v-for="(header, i) in otherHeaders"
          :key="`input-${header.key}`"
        >
          <div
            v-if="result.values[header.key]"
            :class="`dataset-item-card-value-${result._id}-${i}`"
            style="position: relative;"
            :style="noInteraction ? '' : 'cursor:pointer'"
            @mouseenter="!Array.isArray(result.values[header.key]) && emit('hoverstart', result, markRaw(result.values[header.key] as ExtendedResultValue))"
            @mouseleave="emit('hoverstop')"
          >
            <div class="text-caption mt-2">
              {{ header.title }}
            </div>
            <dataset-item-value-multiple
              v-if="Array.isArray(result.values[header.key])"
              :values="result.values[header.key] as ExtendedResultValue[]"
              :property="header.property"
              :dense="true"
              :hovered="hovered"
              :filter="findEqFilter(filters, header.property, result)"
              @filter="v => emit('filter', {property: header.property, operator: 'eq', value: v.raw + '', formattedValue: v.formatted})"
              @hoverstart="v => emit('hoverstart', result, v)"
              @hoverstop="emit('hoverstop')"
            />
            <dataset-item-value
              v-else
              :value="result.values[header.key] as ExtendedResultValue"
              :property="header.property"
              :filtered="!!findEqFilter(filters, header.property, result)"
              :disable-hover="true"
              :dense="true"
              style="padding-right: 16px;"
              @filter="emit('filter', {property: header.property, operator: 'eq', value: (result.values[header.key] as ExtendedResultValue).raw + '', formattedValue: (result.values[header.key] as ExtendedResultValue).formatted})"
              @show-detail-dialog="emit('showDetailDialog', header)"
            />
            <v-icon
              v-if="sort && sort.key === header.key"
              :icon="sort.direction === 1 ? mdiSortAscending : mdiSortDescending"
              color="primary"
              class="item-card-value-icon"
            />
            <v-icon
              v-else-if="hovered === result.values[header.key]"
              :icon="mdiMenuDown"
              class="item-card-value-icon"
            />
          </div>
          <dataset-table-header-menu
            v-if="!noInteraction && hovered === result.values[header.key]"
            :activator="`.dataset-item-card-value-${result._id}-${i}`"
            :header="header"
            :filters="filters"
            :filter-height="filterHeight"
            :sort="header.key === sort?.key ? sort.direction : undefined"
            no-fix
            close-on-filter
            :local-enum="Array.isArray(result.values[header.key]) ? (result.values[header.key] as ExtendedResultValue[]).map(v => v.raw) : [(result.values[header.key] as ExtendedResultValue).raw]"
            @filter="filter => emit('filter', filter)"
            @hide="$emit('hide', header)"
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
        </template>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
  fr:
    showFullValue: Afficher la valeur entière
  en:
    showFullValue: Show full value
  </i18n>

<script lang="ts" setup>
import { type DatasetFilter } from '~/composables/dataset-filters'
import { type ExtendedResult, type ExtendedResultValue } from '~/composables/dataset-lines'
import { type TableHeaderWithProperty } from './table/use-headers'
import { findEqFilter } from '~/composables/dataset-filters'
import { mdiSortAscending, mdiSortDescending, mdiMenuDown, mdiMagnifyPlus } from '@mdi/js'

const { headers } = defineProps({
  result: { type: Object as () => ExtendedResult, required: true },
  filters: { type: Array as () => DatasetFilter[], required: false, default: () => ([]) },
  filterHeight: { type: Number, required: true },
  headers: { type: Array as () => TableHeaderWithProperty[], required: true },
  sort: { type: Object as () => { direction: 1 | -1, key: string }, default: null },
  truncate: { type: Number, default: 50 },
  noInteraction: { type: Boolean, default: false },
  hovered: { type: Object as () => ExtendedResultValue, default: null }
})

const emit = defineEmits<{
  hide: [header: TableHeaderWithProperty],
  filter: [filter: DatasetFilter],
  hoverstart: [result: ExtendedResult, value: ExtendedResultValue],
  hoverstop: [],
  showMapPreview: [],
  showDetailDialog: [header: TableHeaderWithProperty]
}>()

const { t } = useI18n()
const { labelField } = useDatasetStore()

const otherHeaders = computed(() => headers.filter(h => {
  if (!h.property) return false
  // if (this.descriptionField && this.descriptionField.key === f.key) return false
  if (labelField.value && labelField.value.key === h.key) return false
  return true
}))
</script>

<style>

.dataset-item-card .v-input__slot {
  display: block;
  overflow: hidden;
  text-overflow:ellipsis;
}

.dataset-item-card .v-input__slot .v-label {
  font-size:12px;
  line-height: 16px;
  height: 16px;
  bottom: -2px;
  white-space:nowrap;
}

.dataset-item-card .item-card-value-icon {
  position:absolute;
  top:16px;
  right:0px;
}
</style>
