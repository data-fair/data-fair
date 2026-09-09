<template>
  <template v-if="property['x-refersTo'] === 'http://schema.org/DigitalDocument'">
    <!-- attachment_url is empty if the value is an external link -->
    <a
      v-if="typeof extendedValue.raw === 'string' && extendedValue.raw"
      :href="extendedValue.raw"
      :title="t('download', { name: extendedValue.formatted })"
      target="_blank"
      rel="noopener"
    >{{ extendedValue.formatted }}</a>
  </template>
  <template v-else-if="property['x-refersTo'] === 'https://schema.org/WebPage'">
    <a
      v-if="typeof extendedValue.raw === 'string' && extendedValue.raw"
      target="_blank"
      rel="noopener"
      :href="extendedValue.raw"
    >{{ extendedValue.formatted }}</a>
  </template>

  <div
    v-else
    :class="{ 'item-value-with-pin': colorPin }"
  >
    <!-- color pin is an extra decoration prepended to the value -->
    <span
      v-if="colorPin"
      class="item-value-color-pin"
      :class="{ 'item-value-color-pin-dense': dense }"
      :style="`background-color:${extendedValue.raw}`"
    />

    <!-- updatedByName / ownerName: show the user/owner avatar followed by their name (not the avatar URL) -->
    <template v-if="(property.key === '_updatedByName' || property.key === '_ownerName') && extendedValue.formatted.startsWith($sdUrl)">
      <v-avatar
        :size="dense ? 24 : 28"
        :image="extendedValue.formatted"
        class="me-2"
      />
      <span class="pr-2">{{ extendedValue.raw }}</span>
    </template>

    <v-tooltip
      v-else-if="property['x-refersTo'] === 'https://github.com/data-fair/lib/account' && extendedValue.raw"
      location="top"
    >
      <template #activator="{props}">
        <span
          class="text-body-medium"
          v-bind="props"
        >
          <v-avatar
            :size="dense ? 24 : 28"
            :image="extendedValue.formatted"
          />
        </span>
      </template>
      <!-- TODO: fetch account name ? -->
      {{ extendedValue.raw }}
    </v-tooltip>
    <span
      v-else
      class="pr-2"
      :class="{ 'item-value-date-time': !!dateTimeTitle }"
      :title="dateTimeTitle || undefined"
    >
      {{ extendedValue.formatted }}
    </span>
    <div
      v-if="hovered"
      class="item-value-hover-actions"
    >
      <v-btn
        v-if="extendedValue.displayDetail"
        :icon="dense ? mdiLoupe : mdiMagnifyPlus"
        :density="dense ? 'comfortable' : 'default'"
        size="x-small"
        color="primary"
        variant="flat"
        :title="t('showFullValue')"
        @click="emit('showDetailDialog')"
      />
      <v-btn
        v-if="!noFilter && !filtered && extendedValue.filterable"
        :icon="mdiFilterVariant"
        :loading="filterLoading"
        :density="dense ? 'comfortable' : 'default'"
        size="x-small"
        color="primary"
        variant="flat"
        :title="t('filterValue')"
        @click="emit('filter')"
      />
    </div>
  </div>
</template>

<i18n lang="yaml">
fr:
  filterValue: Filtrer les lignes qui ont la même valeur dans cette colonne
  showFullValue: Afficher la valeur entière
  download: "Télécharger {name} (nouvelle fenêtre)"
  dtSource: Source
  dtUtc: UTC
  dtLocal: Votre fuseau
en:
  filterValue: Filter the lines that have the same value in this column
  showFullValue: Show full value
  download: "Download {name} (new window)"
  dtSource: Source
  dtUtc: UTC
  dtLocal: Your timezone
</i18n>

<script setup lang="ts">
import { type SchemaProperty } from '#api/types'
import type { ExtendedResultValue } from '../../../composables/dataset/lines'
import { dateTimeBreakdown } from '../../../composables/dataset/format-date-logic'
import { mdiFilterVariant, mdiLoupe, mdiMagnifyPlus } from '@mdi/js'

const { value: extendedValue, property } = defineProps({
  value: { type: Object as () => ExtendedResultValue, required: true },
  property: { type: Object as () => SchemaProperty, required: true },
  filtered: { type: Boolean, required: true },
  hovered: { type: Boolean, default: false },
  dense: { type: Boolean, default: false },
  filterLoading: { type: Boolean, default: false },
  noFilter: { type: Boolean, default: false }
})

const emit = defineEmits<{
  filter: [],
  showDetailDialog: []
}>()

const colorPin = computed(() => property['x-refersTo'] === 'https://schema.org/color' && !!extendedValue.raw)

const { t } = useI18n()
const localeDayjs = useLocaleDayjs()
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone

// native-title tooltip for a date-time cell: its value in the source timezone, in UTC and in the
// viewer's own timezone — only set when those equivalents actually differ (see format-date-logic)
const dtLabelKeys = { source: 'dtSource', utc: 'dtUtc', local: 'dtLocal' } as const
const dateTimeTitle = computed(() => {
  if (property.format !== 'date-time') return ''
  const lines = dateTimeBreakdown(localeDayjs.dayjs, extendedValue.raw, viewerZone)
  if (lines.length <= 1) return ''
  return lines.map(line => {
    const zoneSuffix = (line.zone && line.kind !== 'utc') ? ` (${line.zone})` : ''
    return `${t(dtLabelKeys[line.kind])} : ${line.time}${zoneSuffix}`
  }).join('\n')
})
</script>

<style>
.item-value-with-pin {
  display: flex;
  align-items: center;
}
.item-value-color-pin {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-right: 6px;
  /* ring contrasted with the theme surface, so pale swatches stay visible in light and dark */
  border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
  box-sizing: border-box;
}
.item-value-color-pin-dense {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.item-value-date-time {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  cursor: help;
}
.item-value-hover-actions {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translate(0, -50%);
  z-index: 100;
  display: flex;
  gap: 2px;
}
</style>
