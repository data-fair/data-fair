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
        tile
        :size="lineHeight"
      >
        <img :src="result._thumbnail">
      </v-avatar>
    </template>
    <template v-else-if="header.key === '_map_preview'">
      <v-btn
        v-if="result._geopoint"
        :icon="mdiMap"
        size="x-small"
        variant="flat"
        absolute
        :title="t('showMapPreview')"
        @click="emit('showMapPreview')"
      />
    </template>
    <template v-else-if="header.key === '_owner'">
      <v-tooltip
        v-if="result._owner"
        location="top"
      >
        <template #activator="{props}">
          <span
            class="text-body-2"
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
          :title="t('unselectLine')"
          color="primary"
          :size="dense ? 'md' : 'large'"
          variant="text"
          :icon="mdiCheckboxMarked"
          @click="emit('select')"
        />
        <v-btn
          v-else
          :size="dense ? 'md' : 'large'"
          variant="text"
          :title="t('selectLine')"
          :icon="mdiCheckboxBlankOutline"
          @click="emit('select')"
        />
      </template>
      <dataset-table-result-actions
        v-else
        v-model:selected-results="selectedResults"
        :result="result"
        :dense="dense"
        @edit="emit('edit')"
        @delete="emit('delete')"
      />
    </template>
    <!--{{ item.__formatted[header.key] }}-->
    <dataset-item-value-multiple
      v-else-if="header.property && Array.isArray(result.values[header.key])"
      :values="result.values[header.key] as ExtendedResultValue[]"
      :property="header.property"
      :dense="dense"
      :hovered="hovered"
      :no-interaction="noInteraction"
      :filter="filter"
      @filter="v => emit('filter', {property: header.property, operator: 'eq', value: v.raw, formattedValue: v.formatted})"
      @hoverstart="v => emit('hoverstart', result, v)"
      @hoverstop="emit('hoverstop')"
    />
    <dataset-item-value
      v-else-if="header.property"
      :value="result.values[header.key] as ExtendedResultValue"
      :property="header.property"
      :dense="dense"
      :hovered="hovered === result.values[header.key]"
      :filtered="!!filter"
      @filter="emit('filter', {property: header.property, operator: 'eq', value: (result.values[header.key] as ExtendedResultValue).raw, formattedValue: (result.values[header.key] as ExtendedResultValue).formatted})"
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

<script lang="ts" setup>
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiMap } from '@mdi/js'
import { type TableHeader } from './use-headers'
import type { ExtendedResult, ExtendedResultValue } from '../../../composables/dataset-lines'
import { type DatasetFilter } from '../../../composables/dataset-filters'

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
