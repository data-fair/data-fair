<template>
  <th
    :class="{'pl-4': !dense, 'pl-2': dense}"
    class="dataset-table-header text-start"
    :data-header="header.value"
    :style="{
      width: width ? width + 'px' : '',
      'min-width': width ? width + 'px' : '',
      'max-width': width ? width + 'px' : '',
      position: 'relative',
      overflow: 'hidden',
      cursor: header.field && !noInteraction ? 'pointer' : 'default'
    }"
    role="button"
    aria-haspopup="true"
    @mouseenter="hover"
    @mouseleave="leave"
  >
    <v-clamp
      :max-lines="2"
      autoresize
      :style="{'margin-right': '14px', 'overflow-wrap': 'break-word'}"
    >
      {{ header.text }}
    </v-clamp>
    <v-icon
      v-if="(hovered && header.field) || header.value === pagination.sortBy[0]"
      style="position:absolute;top:12px;right:2px;"
      :color="header.value === pagination.sortBy[0] ? 'primary' : 'default'"
    >
      <template v-if="header.value === pagination.sortBy[0] && !pagination.sortDesc[0]">mdi-sort-ascending</template>
      <template v-else-if="header.value === pagination.sortBy[0] && pagination.sortDesc[0]">mdi-sort-descending</template>
      <template v-else>mdi-menu-down</template>
    </v-icon>
  </th>
</template>

<script>
import VClamp from 'vue-clamp'

export default {
  components: { VClamp },
  props: {
    header: { type: Object, required: true },
    pagination: { type: Object, required: true },
    width: { type: Number, default: null },
    dense: { type: Boolean, default: false },
    noInteraction: { type: Boolean, default: false }
  },
  data () {
    return {
      hovered: false
    }
  },
  methods: {
    hover (value) {
      if (this.noInteraction) return
      this._hoverTimeout = setTimeout(() => { this.hovered = true }, 60)
    },
    leave (value) {
      if (this.noInteraction) return
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout)
        delete this._hoverTimeout
      }
      this.hovered = false
    }
  }
}
</script>

<style>

</style>
