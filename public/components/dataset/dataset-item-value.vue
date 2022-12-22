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
        :style="`max-height: 40px;`"
      >
        <v-chip-group
          v-if="itemValue"
          style="max-width:500px;"
          show-arrows
        >
          <v-chip
            v-for="(value, i) in itemValue.split(field.separator).map(v => v.trim())"
            v-slot="{ hover }"
            :key="i"
            :class="{'my-0': true, 'px-4': !hover, 'px-2': hover}"
            :color="hover ? 'primary' : 'default'"
            @click="$emit('filter', value)"
            @mouseenter="hoverValue(value)"
            @mouseleave="leaveValue(value)"
          >
            <span>
              {{ value | cellValues(field, truncate) }}
              <v-icon v-if="hover">mdi-filter-variant</v-icon>
            </span>
          </v-chip>
        </v-chip-group>
      </div>

      <div
        v-else
        :style="`max-height: 40px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;`"
        @mouseenter="hoverValue(itemValue)"
        @mouseleave="leaveValue(itemValue)"
      >
        <span>
          {{ itemValue | cellValues(field, truncate) }}
        </span>
        <v-btn
          v-if="hovered[itemValue] && !item._tmpState && !filters.find(f => f.field.key === field.key) && isFilterable(itemValue)"
          fab
          x-small
          color="primary"
          style="right: 4px;top: 50%;transform: translate(0, -50%);z-index:100;"
          absolute
          @click="$emit('filter', itemValue)"
        >
          <v-icon>mdi-filter-variant</v-icon>
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script>
export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 },
    disableHover: { type: Boolean, default: false }
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

</style>
