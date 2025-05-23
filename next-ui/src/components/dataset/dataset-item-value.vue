<template>
  <template v-if="property['x-refersTo'] === 'http://schema.org/DigitalDocument'">
    <!-- attachment_url is empty if the value is an external link -->
    <a
      v-if="typeof extendedValue.raw === 'string' && extendedValue.raw"
      :href="extendedValue.raw"
    >{{ extendedValue.formatted }}</a>
  </template>
  <template v-else-if="property['x-refersTo'] === 'https://schema.org/WebPage'">
    <a
      v-if="typeof extendedValue.raw === 'string' && extendedValue.raw"
      target="_blank"
      :href="extendedValue.raw"
    >{{ extendedValue.formatted }}</a>
  </template>

  <div
    v-else
    @mouseenter="hover()"
    @mouseleave="leave()"
  >
    <v-avatar
      v-if="property.key === '_updatedByName' && extendedValue.formatted.startsWith($sdUrl)"
      :size="28"
      :title="extendedValue.raw"
    >
      <img :src="extendedValue.formatted">
    </v-avatar>
    <div
      v-if="property['x-refersTo'] === 'https://schema.org/color' && extendedValue.raw"
      class="item-value-color-pin"
      :style="`background-color:${extendedValue.raw}`"
    />

    <v-tooltip
      v-if="property['x-refersTo'] === 'https://github.com/data-fair/lib/account' && extendedValue.raw"
      location="top"
    >
      <template #activator="{props}">
        <span
          class="text-body-2"
          v-bind="props"
        >
          <v-avatar :size="28">
            <img :src="extendedValue.formatted">
          </v-avatar>
        </span>
      </template>
      <!-- TODO: fetch account name ? -->
      {{ extendedValue.raw }}
    </v-tooltip>
    <span v-else>
      {{ extendedValue.formatted }}
    </span>
    <template v-if="hovered">
      <v-btn
        v-if="extendedValue.displayDetail"
        :icon="dense"
        size="x-small"
        :style="`right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:${theme.current.value.dark ? '#212121' : 'white'};`"
        absolute
        :title="$t('showFullValue')"
        @click="detailDialog = true;"
      >
        <v-icon v-if="dense">
          mdi-loupe
        </v-icon>
        <v-icon v-else>
          mdi-magnify-plus
        </v-icon>
      </v-btn>
      <v-btn
        v-else-if="!filters.find(f => f.field.key === property.key) && extendedValue.filterable"
        :icon="dense"
        size="x-small"
        color="primary"
        style="right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:white;"
        absolute
        :title="$t('filterValue')"
        @click="emit('filter', extendedValue.raw)"
      >
        <v-icon>mdi-filter-variant</v-icon>
      </v-btn>
    </template>
  </div>

  <dataset-item-detail-dialog
    v-if="detailDialog"
    v-model="detailDialog"
    :extended-result="extendedResult"
    :property="property"
  />
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
import { SchemaProperty } from '#api/types'
import { useTheme } from 'vuetify'
import type { ExtendedResultValue, ExtendedResult } from './table/use-lines'

const { extendedValue, property, disableHover } = defineProps({
  extendedResult: { type: Object as () => ExtendedResult, required: true },
  extendedValue: { type: Object as () => ExtendedResultValue, required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filters: { type: Array as () => any[], required: false, default: () => ([]) },
  truncate: { type: Number, default: 50 },
  lineHeight: { type: Number, default: 40 },
  disableHover: { type: Boolean, default: false },
  dense: { type: Boolean, default: false }
})

const emit = defineEmits(['filter'])

const theme = useTheme()

const hovered = ref(false)
const detailDialog = ref(false)

let _hoverTimeout: ReturnType<typeof setTimeout> | undefined
const hover = () => {
  if (disableHover) return
  _hoverTimeout = setTimeout(() => { hovered.value = true }, 60)
}

const leave = () => {
  if (disableHover) return
  if (_hoverTimeout) {
    clearTimeout(_hoverTimeout)
    _hoverTimeout = undefined
  }
  hovered.value = false
}

</script>

<style>
.item-value-color-pin {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-block;
  position: absolute;
  top: 8px;
  left: 2px;
  border: 2px solid #ccc;
}
</style>
