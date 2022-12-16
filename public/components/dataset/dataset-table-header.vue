<template>
  <th
    class="dataset-table-header text-start"
    :class="{sortable: header.sortable, active : header.value === pagination.sortBy[0] || hover, asc: !pagination.sortDesc[0], desc: pagination.sortDesc[0]}"
    nowrap
    :data-header="header.value"
    :style="{
      cursor: 'default',
      width: width ? width + 'px' : ''
    }"
  >
    <help-tooltip
      v-if="header.tooltip"
      small
      orientation="bottom"
    >
      <div v-html="header.tooltip" />
    </help-tooltip>

    <span
      class="dataset-table-header-title"
      @mouseenter="e => {hover = true}"
      @mouseleave="e => {hover = false}"
      @click="$emit('sort')"
    >
      {{ header.text }}

    </span>
    <v-icon
      v-if="header.sortable"
      class="sort-icon"
      small
    >
      mdi-arrow-up
    </v-icon>

    <dataset-filter-col
      v-if="header.field"
      :max-height="filterHeight"
      :field="header.field"
      :filters="filters"
      @filter="f => $emit('filter', f)"
    />
  </th>
</template>

<script>
export default {
  props: {
    header: { type: Object, required: true },
    filters: { type: Array, required: true },
    filterHeight: { type: Number, required: true },
    pagination: { type: Object, required: true },
    width: { type: Number, default: null }
  },
  data () {
    return {
      hover: false
    }
  }
}
</script>

<style>
.dataset-table-header {
  font-size: 12px;
}
.theme--light .dataset-table-header {
  color: rgba(0, 0, 0, 0.6);
}
.theme--light .dataset-table-header.active {
  color: rgba(0, 0, 0, 0.87);
}
.theme--dark .dataset-table-header {
  color: rgba(255, 255, 255, 0.7);
}
.theme--dark .dataset-table-header.active {
  color: rgb(255, 255, 255);
}
.dataset-table-header.sortable .dataset-table-header-title {
  pointer-events: auto;
  cursor: pointer;
}
.dataset-table-header.sortable .sort-icon {
  visibility: hidden;
  transition: transform .3s ease-in-out !important;
}
.dataset-table-header.sortable.asc .sort-icon {
  transform: rotate(180deg);
}
.dataset-table-header.sortable.active .sort-icon {
  visibility: visible;
}
</style>
