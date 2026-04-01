<template>
  <v-chip-group
    :class="dense ? 'py-0' : ''"
    style="max-width:500px;"
  >
    <v-chip
      v-for="(value, i) in extendedValues"
      :key="i"
      :text="value.formatted"
      :base-color="hovered === value ? 'primary' : 'default'"
      :size="dense ? 'small' : undefined"
      :append-icon="!noInteraction && value.filterable && !value.displayDetail && filter?.value !== value.raw && hovered === value ? mdiFilterVariant : undefined"
      @click="!noInteraction && value.filterable && !value.displayDetail && filter?.value !== value.raw && hovered === value &&emit('filter', value)"
      @mouseenter="emit('hoverstart', markRaw(value))"
      @mouseleave="emit('hoverstop')"
    />
  </v-chip-group>
</template>

<script setup lang="ts">
import type { SchemaProperty } from '#api/types'
import type { DatasetFilter } from '../../../composables/dataset/filters'
import type { ExtendedResultValue } from '../../../composables/dataset/lines'
import { mdiFilterVariant } from '@mdi/js'

const { values: extendedValues } = defineProps({
  values: { type: Array as () => ExtendedResultValue[], required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filter: { type: Object as () => DatasetFilter, default: null },
  lineHeight: { type: Number, default: 40 },
  hovered: { type: Object as () => ExtendedResultValue, default: null },
  dense: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [value: ExtendedResultValue],
  hoverstart: [value: ExtendedResultValue],
  hoverstop: []
}>()
</script>
