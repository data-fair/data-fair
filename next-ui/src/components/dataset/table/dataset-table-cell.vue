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
        :style="`right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:${theme.current.value.dark ? '#212121' : 'white'};`"
        absolute
        :title="$t('showMapPreview')"
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
    <dataset-table-result-actions
      v-else-if="header.key === '_actions'"
      v-model:selected-results="selectedResults"
      :result="result"
      :dense="dense"
      @edit="emit('edit')"
      @delete="emit('delete')"
    />
    <!--{{ item.__formatted[header.key] }}-->
    <dataset-item-value-multiple
      v-else-if="header.property && Array.isArray(result.values[header.key])"
      :values="result.values[header.key] as ExtendedResultValue[]"
      :property="header.property"
      :dense="dense"
      :hovered="hovered"
      :filter="filter"
      @filter="f => emit('filter', f)"
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
  en:
    showMapPreview: Show on a map
</i18n>

<script lang="ts" setup>
import { mdiMap } from '@mdi/js'
import { useTheme } from 'vuetify'
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
  hovered: { type: Object as () => ExtendedResultValue, default: null }
})

const emit = defineEmits<{
  filter: [filter: any],
  hoverstart: [result: ExtendedResult, value: ExtendedResultValue],
  hoverstop: [],
  showMapPreview: [],
  showDetailDialog: [value: ExtendedResultValue],
  edit: [],
  delete: []
}>()

const selectedResults = defineModel<ExtendedResult[]>('selected-results', { default: [] })

const theme = useTheme()
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
