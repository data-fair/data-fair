<template>
  <v-chip-group
    style="max-width:500px;"
    :class="{'dense-value': dense}"
  >
    <v-chip
      v-for="(value, i) in extendedValues"
      :key="i"
      :class="{'my-0': true, 'pr-1': value.filterable && dense, 'pr-2': value.filterable && !dense}"
      :color="hovered === value ? 'primary' : 'default'"
      :size="dense ? 'small' : undefined"
      @click="emit('filter', value)"
      @mouseenter="emit('hoverstart', markRaw(value))"
      @mouseleave="emit('hoverstop')"
    >
      <span>
        {{ value.formatted }}
        <v-icon
          v-if="value.filterable && !value.displayDetail && filter?.value !== value.raw"
          :style="{width: '14px'}"
          :size="dense ? 14 : 18"
          :icon="hovered === value ? mdiFilterVariant : undefined"
        />
      </span>
    </v-chip>
  </v-chip-group>
</template>

<i18n lang="yaml">
fr:
  filterValue: Filtrer les lignes qui ont la même valeur dans cette colonne
  showFullValue: Afficher la valeur entière
en:
  filterValue: Filter the lines that have the same value in this column
  showFullValue: Show full value
</i18n>

<script lang="ts" setup>
import { type SchemaProperty } from '#api/types'
import { type DatasetFilter } from '../../composables/dataset-filters'
import { type ExtendedResultValue } from '../../composables/dataset-lines'
import { mdiFilterVariant } from '@mdi/js'

const { extendedValues } = defineProps({
  extendedValues: { type: Array as () => ExtendedResultValue[], required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filter: { type: Object as () => DatasetFilter, default: null },
  truncate: { type: Number, default: 50 },
  lineHeight: { type: Number, default: 40 },
  hovered: { type: Object as () => ExtendedResultValue, default: null },
  dense: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [value: any],
  hoverstart: [value: ExtendedResultValue],
  hoverstop: []
}>()
</script>

<style>
.v-chip-group.dense-value .v-slide-group__content {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
</style>
