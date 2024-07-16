<template>
  <div>
    <template v-if="isDigitalDocument">
      <!-- attachment_url is empty if the value is an external link -->
      <a v-if="item._attachment_url" :href="item._attachment_url">{{ item._attachment_url.split('/').pop() | truncate(truncate - 4, 4) }}</a>
      <a v-else-if="!!itemValue" :href="itemValue">{{ itemValue | truncate(truncate - 10, 10) }}</a>
    </template>
    <template v-else-if="isWebPage">
      <a
        v-if="itemValue"
        target="_blank"
        :href="itemValue"
      >{{ itemValue | truncate(truncate) }}</a>
    </template>
    <template v-else>
      <div
        v-if="field.type === 'string' && field.separator"
        :style="`max-height: ${lineHeight}px;`"
      >
        <v-chip-group
          v-if="itemValue"
          style="max-width:500px;"
          show-arrows
          :class="{'dense-value': dense}"
        >
          <v-chip
            v-for="(value, i) in itemValue.split(field.separator).map(v => v.trim())"
            :key="i"
            :class="{'my-0': true, 'pr-1': isFilterable(value) && dense, 'pr-2': isFilterable(value) && !dense}"
            :color="hovered[value] ? 'primary' : 'default'"
            :small="dense"
            @click="$emit('filter', value)"
            @mouseenter="hoverValue(value)"
            @mouseleave="leaveValue(value)"
          >
            <span>
              {{ value | cellValues(field, truncate) }}
              <v-icon
                v-if="isFilterable(value)"
                :style="{width: '14px'}"
                :size="dense ? 14 : 18"
              >{{ hovered[value] ? 'mdi-filter-variant' : '' }}</v-icon>
            </span>
          </v-chip>
        </v-chip-group>
      </div>

      <div
        v-else
        :style="`max-height:${lineHeight}px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-left: ${(field['x-refersTo'] === 'https://schema.org/color' && itemValue) ? '12px;' : '0'}`"
        @mouseenter="hoverValue(itemValue)"
        @mouseleave="leaveValue(itemValue)"
      >
        <v-avatar
          v-if="field.key === '_updatedByName' && item._updatedBy && !item._updatedBy.startsWith('apiKey:')"
          :size="28"
        >
          <img :src="`${env.directoryUrl}/api/avatars/user/${item._updatedBy}/avatar.png`">
        </v-avatar>
        <div
          v-if="field['x-refersTo'] === 'https://schema.org/color' && itemValue"
          class="item-value-color-pin"
          :style="`background-color:${itemValue}`"
        />

        <v-tooltip
          v-if="isAccount && itemValue"
          top
        >
          <template #activator="{on}">
            <span
              class="text-body-2"
              v-on="on"
            >
              <v-avatar :size="28">
                <img :src="`${env.directoryUrl}/api/avatars/${itemValue.split(':').join('/')}/avatar.png`">
              </v-avatar>
            </span>
          </template>
          <!-- TODO: fetch account name ? -->
          {{ itemValue }}
        </v-tooltip>
        <span v-else>
          {{ itemValue | cellValues(field, truncate) }}
        </span>
        <template v-if="hovered[itemValue] && !item._tmpState">
          <v-btn
            v-if="!filters.find(f => f.field.key === field.key) && isFilterable(itemValue)"
            :fab="!dense"
            :icon="dense"
            x-small
            color="primary"
            style="right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:white;"
            absolute
            :title="$t('filterValue')"
            @click="$emit('filter', itemValue)"
          >
            <v-icon>mdi-filter-variant</v-icon>
          </v-btn>
          <v-btn
            v-else-if="shouldDisplayDetail"
            :fab="!dense"
            :icon="dense"
            x-small
            :style="`right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;background-color:${$vuetify.theme.dark ? '#212121' : 'white'};`"
            absolute
            :title="$t('showFullValue')"
            @click="detailDialog = true;"
          >
            <v-icon v-if="dense">mdi-loupe</v-icon>
            <v-icon v-else>mdi-magnify-plus</v-icon>
          </v-btn>
        </template>
      </div>
    </template>

    <dataset-item-detail-dialog
      v-model="detailDialog"
      :item="item"
      :field="field"
    />
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

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 },
    lineHeight: { type: Number, default: 40 },
    disableHover: { type: Boolean, default: false },
    dense: { type: Boolean, default: false },
    noInteraction: { type: Boolean, default: false }
  },
  data () {
    return {
      hovered: {},
      fullValue: null,
      detailDialog: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapGetters('dataset', ['resourceUrl']),
    itemValue () {
      return this.item[this.field.key]
    },
    detailValue () {
      return this.fullValue ?? this.itemValue
    },
    isDigitalDocument () {
      return this.field['x-refersTo'] === 'http://schema.org/DigitalDocument'
    },
    isWebPage () {
      return this.field['x-refersTo'] === 'https://schema.org/WebPage'
    },
    isAccount () {
      return this.field['x-refersTo'] === 'https://github.com/data-fair/lib/account'
    },
    shouldDisplayDetail () {
      if (this.noInteraction) return false
      if (this.isDigitalDocument) return false
      if (this.isWebPage) return false
      return this.field.type === 'string' && !this.field.separator && this.itemValue && this.truncate < this.itemValue.length
    }
  },
  methods: {
    isFilterable (value) {
      if (this.noInteraction) return false
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      if (this.field['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
      if (value === undefined || value === null || value === '') return false
      if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
      if (this.shouldDisplayDetail) return false
      return true
    },
    hoverValue (value) {
      if (this.disableHover) return
      this._hoverTimeout = setTimeout(() => { this.$set(this.hovered, value, true) }, 60)
    },
    leaveValue (value) {
      if (this.disableHover) return
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout)
        delete this._hoverTimeout
      }
      this.$delete(this.hovered, value)
    }
  }
}
</script>

<style>
.v-chip-group.dense-value .v-slide-group__content {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
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
