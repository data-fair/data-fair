<template>
  <td
    class="pr-0 dataset-table-cell"
    :class="{'pl-2': dense}"
    :style="`height: ${lineHeight}px;position:relative;`"
  >
    <template v-if="header.value === '_thumbnail'">
      <v-avatar
        v-if="item._thumbnail"
        tile
        :size="lineHeight"
      >
        <img :src="item._thumbnail">
      </v-avatar>
    </template>
    <template v-if="header.value === '_map_preview'">
      <v-btn
        v-if="item._geopoint"
        icon
        x-small
        :style="`right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:${$vuetify.theme.dark ? '#212121' : 'white'};`"
        absolute
        :title="$t('showMapPreview')"
        @click="showMapPreview = true"
      >
        <v-icon>mdi-map</v-icon>
      </v-btn>
      <v-dialog
        v-model="showMapPreview"
        max-width="700"
        :overlay-opacity="0"
      >
        <v-card
          v-if="showMapPreview"
          outlined
        >
          <v-btn
            style="position:absolute;top:4px;right:4px;z-index:1000;"
            icon
            @click.native="showMapPreview = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <dataset-map
            :key="item._id"
            :height-margin="0"
            navigation-position="top-left"
            :single-item="item._id"
          />
        </v-card>
      </v-dialog>
    </template>
    <template v-else-if="header.value === '_owner'">
      <v-tooltip top>
        <template #activator="{on}">
          <span
            class="text-body-2"
            v-on="on"
          >
            <v-avatar :size="28">
              <img :src="`${env.directoryUrl}/api/avatars/${item._owner.split(':').join('/')}/avatar.png`">
            </v-avatar>
          </span>
        </template>
        {{ item._owner }}
      </v-tooltip>
    </template>
    <dataset-item-value
      v-else
      :item="item"
      :field="header.field"
      :filters="filters"
      :truncate="truncate"
      :dense="dense"
      :line-height="lineHeight"
      :no-interaction="noInteraction"
      @filter="f => $emit('filter', f)"
    />
  </td>
</template>

<i18n lang="yaml">
  fr:
    showMapPreview: Voir sur une carte
  en:
    showMapPreview: Show on a map
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    header: { type: Object, required: true },
    lineHeight: { type: Number, required: true },
    filters: { type: Array, required: true },
    truncate: { type: Number, required: true },
    dense: { type: Boolean, default: false },
    noInteraction: { type: Boolean, default: false }
  },
  data: () => ({
    showMapPreview: false
  }),
  computed: {
    ...mapState(['env'])
  }
}
</script>

<style>
.dataset-table-cell {
  overflow-x: hidden;
}
</style>
