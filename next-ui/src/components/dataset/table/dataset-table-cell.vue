<template>
  <td
    class="dataset-table-cell pr-0 text-no-wrap"
    :class="{'pl-2': dense, 'sticky': header.sticky, 'bg-surface': header.sticky, 'border-e-thin': header.sticky, 'pr-2': header.sticky}"
    :style="{
      height: lineHeight + 'px',
    }"
    @mouseenter="!Array.isArray(item.values[header.key]) && emit('hoverstart', markRaw(item.values[header.key]) as ExtendedResultValue)"
    @mouseleave="emit('hoverstop')"
  >
    <template v-if="header.key === '_thumbnail'">
      <v-avatar
        v-if="item._thumbnail"
        tile
        :size="lineHeight"
      >
        <img :src="item._thumbnail">
      </v-avatar>
    </template>
    <template v-if="header.key === '_map_preview'">
      <v-btn
        v-if="item._geopoint"
        icon
        size="x-small"
        :style="`right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:${theme.current.value.dark ? '#212121' : 'white'};`"
        absolute
        :title="$t('showMapPreview')"
        @click="emit('showMapPreview')"
      >
        <v-icon>mdi-map</v-icon>
      </v-btn>
    </template>
    <template v-else-if="header.key === '_owner'">
      <v-tooltip
        v-if="item._owner"
        location="top"
      >
        <template #activator="{props}">
          <span
            class="text-body-2"
            v-bind="props"
          >
            <v-avatar :size="28">
              <img :src="`${$sdUrl}/api/avatars/${item._owner.split(':').join('/')}/avatar.png`">
            </v-avatar>
          </span>
        </template>
        {{ item._owner }}
      </v-tooltip>
    </template>
    <!--{{ item.__formatted[header.key] }}-->
    <dataset-item-value-multiple
      v-else-if="Array.isArray(item.values[header.key])"
      :extended-values="item.values[header.key] as ExtendedResultValue[]"
      :property="header.property"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      :hovered="hovered"
      :filter="filter"
      @filter="f => emit('filter', f)"
      @hoverstart="v => emit('hoverstart', v)"
      @hoverstop="emit('hoverstop')"
    />
    <dataset-item-value
      v-else
      :extended-result="item"
      :extended-value="item.values[header.key] as ExtendedResultValue"
      :property="header.property"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      :hovered="hovered === item.values[header.key]"
      :filtered="!!filter"
      @filter="emit('filter', {property: header.property, operator: 'eq', value: (item.values[header.key] as ExtendedResultValue).raw, formattedValue: (item.values[header.key] as ExtendedResultValue).formatted})"
      @show-detail-dialog="emit('showDetailDialog', markRaw(item.values[header.key] as ExtendedResultValue))"
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
import { useTheme } from 'vuetify'
import { type TableHeader } from './use-headers'
import type { ExtendedResult, ExtendedResultValue } from '../../../composables/dataset-lines'
import { DatasetFilter } from '../../../composables/dataset-filters'

defineProps({
  item: { type: Object as () => ExtendedResult, required: true },
  header: { type: Object as () => TableHeader, required: true },
  lineHeight: { type: Number, required: true },
  filter: { type: Object as () => DatasetFilter, default: null },
  truncate: { type: Number, required: true },
  dense: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false },
  hovered: { type: Object as () => ExtendedResultValue, default: null }
})

const emit = defineEmits<{
  filter: [filter: any],
  hoverstart: [value: ExtendedResultValue],
  hoverstop: [],
  showMapPreview: [],
  showDetailDialog: [value: ExtendedResultValue]
}>()

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
