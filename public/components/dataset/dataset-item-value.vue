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
        :style="`max-height: 40px; min-width: ${Math.min((itemValue + '').length, 50) * 6}px;`"
      >
        <v-chip-group
          v-if="itemValue"
          style="max-width:500px;"
          show-arrows
        >
          <v-hover
            v-for="(value, i) in itemValue.split(field.separator).map(v => v.trim())"
            v-slot="{ hover }"
            :key="i"
          >
            <v-chip
              :class="{'my-0': true, 'px-4': !hover, 'px-2': hover}"
              :color="hover ? 'primary' : 'default'"
              @click="addFilter(field.key, value)"
            >
              <span>
                {{ value | cellValues(field, truncate) }}
                <v-icon v-if="hover">mdi-filter-variant</v-icon>
              </span>
            </v-chip>
          </v-hover>
        </v-chip-group>
      </div>
      <v-hover
        v-else
        v-slot="{ hover }"
      >
        <div :style="`max-height: 40px; min-width: ${Math.min((itemValue + '').length, 50) * 6}px;`">
          <span>{{ itemValue | cellValues(field, truncate) }}</span>
          <v-btn
            v-if="hover && !item._tmpState && !filters.find(f => f.field.key === field.key) && isFilterable(itemValue)"
            fab
            x-small
            color="primary"
            style="right: 0px;top: 50%;transform: translate(0, -50%);z-index:100;"
            absolute
            @click="$emit('filter', itemValue)"
          >
            <v-icon>mdi-filter-variant</v-icon>
          </v-btn>
        </div>
      </v-hover>
    </template>
  </div>
</template>

<script>
export default {
  props: {
    item: { type: Object, required: true },
    field: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 }
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
    }
  }
}
</script>

<style>

</style>