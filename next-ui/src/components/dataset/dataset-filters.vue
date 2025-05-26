<template>
  <v-slide-group
    show-arrows
    class="dataset-filters"
  >
    <v-slide-group-item
      v-for="(filter,i) in filters"
      :key="i"
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
        :style="{height: '40px', borderRadius: '20px', lineHeight: '16px', maxWidth: (maxWidth - 16) + 'px'}"
        @click:close="removeFilter(filter)"
        @click="toggle"
      >
        <div style="overflow: hidden;">
          <span style="display:inline-block;white-space:nowrap;">{{ (filter.property.title || filter.property['x-originalName'] || filter.property.key) }}</span>
          <br>
          <span style="display:inline-block">
            {{ t(filter.operator) }}  {{ filter.formattedValue }}
          </span>
        </div>
      </v-chip>
    </v-slide-group-item>
  </v-slide-group>
</template>

<i18n lang="yaml">
  fr:
    eq: '='
    neq: '&ne;'
    starts: 'commence par'
    lte: '&leq;'
    gte: '&GreaterEqual;'
    search: contient les mots
    contains: contient les caractères
</i18n>

<script lang="ts" setup>
import { useCurrentElement, useElementSize } from '@vueuse/core'
import { type DatasetFilter } from '~/composables/dataset-filters'

const filters = defineModel<DatasetFilter[]>({ default: [] })
const { width: maxWidth } = useElementSize(useCurrentElement())

const { t } = useI18n()

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
