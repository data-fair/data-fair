<template>
  <v-slide-group
    show-arrows
    class="dataset-filters"
  >
    <v-slide-group-item
      v-for="(filter,i) in filters"
      :key="filter.property.key + '-' + filter.operator"
      v-slot="{toggle}"
    >
      <v-chip
        v-if="!filter.hidden"
        :class="{'ml-1': i > 0}"
        closable
        size="small"
        :model-value="true"
        color="primary"
        variant="outlined"
        style="font-weight: bold;"
        :style="{height: '40px', borderRadius: '20px', lineHeight: '16px', maxWidth: (maxWidth - 96) + 'px'}"
        @click:close="removeFilter(filter)"
        @click="toggle"
      >
        <div :style="`max-width: ${maxWidth - 136}px;`">
          <span style="display:inline-block;white-space:nowrap;">{{ filterLabel(filter) + (opOnLabel(filter) ? ' ' + t(filter.operator) : '') }}</span>
          <br>
          <span style="display:inline-block;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow: ellipsis;">{{ (opOnLabel(filter) ? '' : t(filter.operator) + ' ') + filter.formattedValue }}</span>
        </div>
      </v-chip>
    </v-slide-group-item>
  </v-slide-group>
</template>

<i18n lang="yaml">
  fr:
    in: 'parmi'
    nin: 'hors'
    eq: '='
    neq: '≠'
    starts: 'commence par'
    lte: '≤'
    gte: '≥'
    search: recherche textuelle
    contains: contient les caractères
    exists: 'existe'
    nexists: "n'existe pas"
</i18n>

<script setup lang="ts">
import { useCurrentElement, useElementSize } from '@vueuse/core'
import { type DatasetFilter } from '~/composables/dataset/filters'

const filters = defineModel<DatasetFilter[]>({ default: () => [] })
// the chip widths leave room for the 2 scroll arrows (40px each), so a long chip is never hidden under one
const { width: maxWidth } = useElementSize(useCurrentElement())

const { t } = useI18n()

const filterLabel = (filter: DatasetFilter) => filter.property.title || filter.property['x-originalName'] || filter.property.key
// the operator sits next to the value, unless the value is much longer than the column label
const opOnLabel = (filter: DatasetFilter) => (filter.formattedValue ?? '').length > 2 * filterLabel(filter).length

const removeFilter = (filter: DatasetFilter) => {
  filters.value = filters.value.filter(f => f !== filter)
}
</script>

<style lang="css">
.dataset-filters .v-slide-group__prev, .dataset-filters .v-slide-group__next {
  min-width: 40px;
}

.dataset-filters .v-chip_content {
  max-width: 100%;
}
</style>
