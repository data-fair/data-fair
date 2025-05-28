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

  <div v-else>
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
    <span
      v-else
      class="pr-2"
    >
      {{ extendedValue.formatted }}
    </span>
    <template v-if="hovered">
      <v-btn
        v-if="extendedValue.displayDetail"
        :icon="dense ? mdiLoupe : mdiMagnifyMinus"
        size="x-small"
        class="item-value-hover-action"
        :style="`background-color:${theme.current.value.dark ? '#212121' : 'white'};`"
        :title="t('showFullValue')"
        @click="emit('showDetailDialog')"
      />
      <v-btn
        v-else-if="!filtered && extendedValue.filterable"
        :icon="mdiFilterVariant"
        size="x-small"
        color="primary"
        class="item-value-hover-action"
        style="background-color:white;"
        :title="t('filterValue')"
        @click="emit('filter')"
      />
    </template>
  </div>
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
import { useTheme } from 'vuetify'
import type { ExtendedResultValue } from '../../composables/dataset-lines'
import { mdiFilterVariant, mdiLoupe, mdiMagnifyMinus } from '@mdi/js'

const { value: extendedValue, property } = defineProps({
  value: { type: Object as () => ExtendedResultValue, required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filtered: { type: Boolean, required: true },
  hovered: { type: Boolean, default: false },
  dense: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [],
  showDetailDialog: []
}>()

const theme = useTheme()
const { t } = useI18n()
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
.item-value-hover-action {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translate(0, -50%);
  z-index:100;
}
</style>
