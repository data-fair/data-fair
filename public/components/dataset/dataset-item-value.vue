<template>
  <div>
    <template v-if="isDigitalDocument">
      <!-- attachment_url is empty if the value is an external link -->
      <a :href="item._attachment_url || itemValue">{{ itemValue | truncate(truncate) }}</a>
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
        <div
          v-if="field['x-refersTo'] === 'https://schema.org/color' && itemValue"
          class="item-value-color-pin"
          :style="`background-color:${itemValue}`"
        />
        <span>
          {{ itemValue | cellValues(field, truncate) }}
        </span>
        <v-btn
          v-if="hovered[itemValue] && !item._tmpState && !filters.find(f => f.field.key === field.key) && isFilterable(itemValue)"
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
      </div>
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  filterValue: Filtrer les lignes qui ont la même valeur dans cette colonne
en:
  filterValue: Filter the lines that have the same value in this column
</i18n>

<script>
export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 },
    lineHeight: { type: Number, default: 40 },
    disableHover: { type: Boolean, default: false },
    dense: { type: Boolean, default: false }
  },
  data () {
    return {
      hovered: {}
    }
  },
  computed: {
    itemValue () {
      return this.item[this.field.key]
    },
    isDigitalDocument () {
      return this.field['x-refersTo'] === 'http://schema.org/DigitalDocument'
    },
    isWebPage () {
      return this.field['x-refersTo'] === 'https://schema.org/WebPage'
    }
  },
  methods: {
    isFilterable (value) {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      if (this.field['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
      if (value === undefined || value === null || value === '') return false
      if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
      if (typeof value === 'string' && value.endsWith('...')) return false
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
