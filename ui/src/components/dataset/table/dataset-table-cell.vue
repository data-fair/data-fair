<template>
  <td
    class="dataset-table-cell pr-0 text-no-wrap"
    :class="{'pl-2': dense, 'sticky': header.sticky, 'bg-surface': header.sticky, 'border-e-thin': header.sticky, 'pr-2': header.sticky}"
    :style="{
      height: lineHeight + 'px',
    }"
    @mouseenter="result.values[header.key] && !Array.isArray(result.values[header.key]) && emit('hoverstart', result, markRaw(result.values[header.key]) as ExtendedResultValue)"
    @mouseleave="emit('hoverstop')"
  >
    <template v-if="header.key === '_thumbnail'">
      <v-avatar
        v-if="result._thumbnail"
        rounded="0"
        :size="lineHeight"
      >
        <img :src="result._thumbnail">
      </v-avatar>
    </template>

    <template v-else-if="header.key === '_map_preview'">
      <v-btn
        v-if="result._geopoint"
        :icon="mdiMap"
        :title="t('showMapPreview')"
        position="absolute"
        size="x-small"
        variant="flat"
        style="right: 4px; top: 50%; transform: translateY(-50%); z-index: 100;"
        @click="emit('showMapPreview')"
      />
    </template>

    <template v-else-if="header.key === '_owner'">
      <v-tooltip
        v-if="result._owner"
        location="top"
      >
        <template #activator="{ props }">
          <span
            class="text-body-medium"
            v-bind="props"
          >
            <v-avatar :size="28">
              <img :src="`${$sdUrl}/api/avatars/${result._owner.split(':').join('/')}/avatar.png`">
            </v-avatar>
          </span>
        </template>
        {{ result._owner }}
      </v-tooltip>
    </template>

    <template v-if="header.key === '_actions'">
      <template v-if="selectable">
        <v-btn
          v-if="selected"
          :icon="mdiCheckboxMarked"
          :size="dense ? 'md' : 'large'"
          :title="t('unselectLine')"
          color="primary"
          density="compact"
          variant="text"
          @click="emit('select')"
        />
        <v-btn
          v-else
          :icon="mdiCheckboxBlankOutline"
          :size="dense ? 'md' : 'large'"
          :title="t('selectLine')"
          density="compact"
          variant="text"
          @click="emit('select')"
        />
      </template>

      <dataset-table-result-actions
        v-else
        v-model:selected-results="selectedResults"
        :dense="dense"
        :result="result"
        @edit="emit('edit')"
        @delete="emit('delete')"
      />
    </template>

    <dataset-table-value-multiple
      v-else-if="header.property && Array.isArray(result.values[header.key])"
      :dense="dense"
      :filter="filter"
      :hovered="hovered"
      :no-interaction="noInteraction"
      :property="header.property"
      :values="result.values[header.key] as ExtendedResultValue[]"
      @filter="v => emit('filter', {property: header.property, operator: 'eq', value: v.raw, formattedValue: v.formatted})"
      @hoverstart="v => emit('hoverstart', result, v)"
      @hoverstop="emit('hoverstop')"
    />

    <dataset-table-value
      v-else-if="header.property"
      :filter-loading="filterLoading"
      :filtered="!!filter"
      :hovered="hovered === result.values[header.key]"
      :property="header.property"
      :value="result.values[header.key] as ExtendedResultValue"
      :dense="dense"
      @filter="filterValue(result, header)"
      @show-detail-dialog="emit('showDetailDialog', markRaw(result.values[header.key] as ExtendedResultValue))"
    />
  </td>
</template>

<i18n lang="yaml">
  fr:
    showMapPreview: Voir sur une carte
    selectLine: Sélectionner la ligne
    unselectLine: Désélectionner la ligne
  en:
    showMapPreview: Show on a map
    selectLine: Select the line
    unselectLine: Deselect the line
</i18n>

<script setup lang="ts">
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiMap } from '@mdi/js'
import { type TableHeader } from './use-headers'
import type { ExtendedResult, ExtendedResultValue } from '../../../composables/dataset/lines'
import { type DatasetFilter } from '../../../composables/dataset/filters'

const { id } = useDatasetStore()
const filterLoading = ref(false)
const filterValue = async (result: ExtendedResult, header: TableHeader) => {
  if (!header.property) return
  const value = result.values[header.key] as ExtendedResultValue
  if (value?.displayDetail) {
    filterLoading.value = true
    try {
      const data = await $fetch<{ results: Record<string, any>[] }>(`${$apiPath}/datasets/${id}/lines`, {
        query: { qs: `_id:"${result._id}"`, select: header.key }
      })
      const fullValue = data.results[0]?.[header.key]
      emit('filter', { property: header.property, operator: 'eq', value: fullValue, formattedValue: fullValue })
    } finally {
      filterLoading.value = false
    }
  } else {
    emit('filter', { property: header.property, operator: 'eq', value: value.raw, formattedValue: value.formatted })
  }
}

defineProps({
  result: { type: Object as () => ExtendedResult, required: true },
  header: { type: Object as () => TableHeader, required: true },
  lineHeight: { type: Number, required: true },
  filter: { type: Object as () => DatasetFilter, default: null },
  dense: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false },
  hovered: { type: Object as () => ExtendedResultValue, default: null },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [filter: any],
  hoverstart: [result: ExtendedResult, value: ExtendedResultValue],
  hoverstop: [],
  showMapPreview: [],
  showDetailDialog: [value: ExtendedResultValue],
  edit: [],
  delete: [],
  select: []
}>()

const selectedResults = defineModel<ExtendedResult[]>('selected-results', { default: [] })

const { t } = useI18n()
</script>

<style>
.dataset-table-cell {
  position: relative;
}
.dataset-table-cell.sticky {
  position: sticky;
  left: 0;
  z-index: 1;
}
</style>
