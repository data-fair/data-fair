<template>
  <td
    class="pr-0 dataset-table-cell"
    :class="{'pl-2': dense, 'text-no-wrap': true}"
    :style="`height: ${lineHeight}px;position:relative;`"
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
        @click="showMapPreview = true"
      >
        <v-icon>mdi-map</v-icon>
      </v-btn>
      <v-dialog
        v-model="showMapPreview"
        max-width="700"
        :scrim="false"
      >
        <v-card
          v-if="showMapPreview"
        >
          <v-btn
            style="position:absolute;top:4px;right:4px;z-index:1000;"
            icon
            @click="showMapPreview = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <dataset-map
            :key="item._id"
            :height="mapHeight"
            navigation-position="top-left"
            :single-item="item._id"
          />
        </v-card>
      </v-dialog>
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
      :filters="filters"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      @filter="f => emit('filter', f)"
    />
    <dataset-item-value
      v-else
      :extended-result="item"
      :extended-value="item.values[header.key]"
      :property="header.property"
      :filters="filters"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      @filter="f => emit('filter', f)"
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
import type { ExtendedResult, ExtendedResultValue } from './use-lines'

const { tableHeight } = defineProps({
  item: { type: Object as () => ExtendedResult, required: true },
  header: { type: Object as () => TableHeader, required: true },
  lineHeight: { type: Number, required: true },
  tableHeight: { type: Number, required: true },
  filters: { type: Array, required: true },
  truncate: { type: Number, required: true },
  dense: { type: Boolean, default: false },
  noInteraction: { type: Boolean, default: false }
})

const emit = defineEmits(['filter'])

const theme = useTheme()

const showMapPreview = ref(false)

const mapHeight = computed(() => {
  return Math.max(400, Math.min(700, tableHeight * 0.8))
})

</script>

<style>
</style>
