<template>
  <v-hover v-slot="{hover}">
    <th
      class="dataset-table-header text-start"
      :data-header="header.value"
      :style="{
        width: width ? width + 'px' : '',
        'min-width': width ? width + 'px' : '',
        'max-width': width ? width + 'px' : '',
        position: 'relative',
        overflow: 'hidden'
      }"
      role="button"
      aria-haspopup="true"
      style="cursor:pointer"
    >
      <v-clamp
        :max-lines="2"
        autoresize
        :style="{'margin-right': '14px',}"
      >
        {{ header.text }}
      </v-clamp>
      <v-icon
        v-if="hover || header.value === pagination.sortBy[0]"
        style="position:absolute;top:12px;right:2px;"
        :color="header.value === pagination.sortBy[0] ? 'primary' : 'default'"
      >
        <template v-if="header.value === pagination.sortBy[0] && !pagination.sortDesc[0]">mdi-sort-ascending</template>
        <template v-else-if="header.value === pagination.sortBy[0] && pagination.sortDesc[0]">mdi-sort-descending</template>
        <template v-else>mdi-menu-down</template>
      </v-icon>
    </th>
  </v-hover>
</template>

<script>
import VClamp from 'vue-clamp'

export default {
  components: { VClamp },
  props: {
    header: { type: Object, required: true },
    pagination: { type: Object, required: true },
    width: { type: Number, default: null }
  }
}
</script>

<style>

</style>
