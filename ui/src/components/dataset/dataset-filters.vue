<template>
  <!-- the chips' close buttons are the Tab stops: the group's container would be one more, an
       invisible one when there is no filter. A chip has no action of its own: clickable, it
       looked like it had one, and it took the Enter key away from its close button -->
  <v-slide-group
    show-arrows
    class="dataset-filters"
    tabindex="-1"
  >
    <v-slide-group-item
      v-for="(filter,i) in filters"
      :key="filter.property.key + '-' + filter.operator"
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
        @click:close="onClose(filter)"
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
const el = useCurrentElement<HTMLElement>()
const { width: maxWidth } = useElementSize(el)

const { t } = useI18n()

const filterLabel = (filter: DatasetFilter) => filter.property.title || filter.property['x-originalName'] || filter.property.key
// the operator sits next to the value, unless the value is much longer than the column label
const opOnLabel = (filter: DatasetFilter) => (filter.formattedValue ?? '').length > 2 * filterLabel(filter).length

const removeFilter = (filter: DatasetFilter) => {
  filters.value = filters.value.filter(f => f !== filter)
}

const closeButtons = () => [...(el.value?.querySelectorAll<HTMLElement>('.v-chip button') ?? [])]
// the focused close button goes away with its chip: the focus goes to a neighbour's, or to what
// comes before the bar (the search field) once it is empty, instead of falling to the page body
const onClose = async (filter: DatasetFilter) => {
  const bar = el.value
  const index = closeButtons().findIndex(b => b === document.activeElement)
  removeFilter(filter)
  if (!bar || index === -1) return
  await nextTick()
  const buttons = closeButtons()
  const before = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]')]
    .filter(e => e.tabIndex >= 0 && e.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING && e.getClientRects().length > 0)
  const target = buttons[Math.min(index, buttons.length - 1)] ?? before[before.length - 1]
  target?.focus()
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
