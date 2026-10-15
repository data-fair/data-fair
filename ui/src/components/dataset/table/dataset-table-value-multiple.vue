<template>
  <!-- not a v-chip-group: its container is a Tab stop of its own and it handles the arrow
       keys, both against the table's keyboard navigation (RGAA 7.3) -->
  <div
    class="dataset-table-chips"
    style="max-width:500px;"
  >
    <v-chip
      v-for="(value, i) in extendedValues"
      :key="i"
      tabindex="-1"
      class="my-0 mr-2"
      :text="value.formatted"
      :base-color="hovered === value ? 'primary' : 'default'"
      :size="dense ? 'small' : undefined"
      :append-icon="canFilter(value) && hovered === value ? (isFiltered(value) ? mdiFilterRemove : mdiFilterVariant) : undefined"
      @click="(e: MouseEvent | KeyboardEvent) => onChipClick(value, e)"
      @mouseenter="emit('hoverstart', markRaw(value))"
      @focus="emit('hoverstart', markRaw(value), true)"
      @mouseleave="emit('hoverstop')"
    />
  </div>
</template>

<script setup lang="ts">
import type { SchemaProperty } from '#api/types'
import type { DatasetFilter } from '../../../composables/dataset/filters'
import type { ExtendedResultValue } from '../../../composables/dataset/lines'
import { mdiFilterRemove, mdiFilterVariant } from '@mdi/js'

const { values: extendedValues, hovered, noInteraction, noFilter, filter } = defineProps({
  values: { type: Array as () => ExtendedResultValue[], required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filter: { type: Object as () => DatasetFilter, default: null },
  lineHeight: { type: Number, default: 40 },
  hovered: { type: Object as () => ExtendedResultValue, default: null },
  dense: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false },
  noFilter: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [value: ExtendedResultValue],
  removeFilter: [],
  hoverstart: [value: ExtendedResultValue, immediate?: boolean],
  hoverstop: []
}>()

const canFilter = (value: ExtendedResultValue) => !noInteraction && !noFilter && value.filterable && !value.displayDetail
// filter values are strings (as in the URL), raw values are typed
const isFiltered = (value: ExtendedResultValue) => !!filter && filter.value === '' + value.raw

// a mouse click filters (or removes the filter) once the icon shows on the hovered chip;
// Enter or Space on the focused chip (v-chip passes the keyboard event) acts right away
const onChipClick = (value: ExtendedResultValue, e: MouseEvent | KeyboardEvent) => {
  if (!canFilter(value) || (hovered !== value && !(e instanceof KeyboardEvent))) return
  if (isFiltered(value)) emit('removeFilter')
  else emit('filter', value)
}
</script>

<style>
.dataset-table-chips {
  display: flex;
  flex-wrap: nowrap;
  overflow: hidden;
  min-width: 0;
}
</style>
