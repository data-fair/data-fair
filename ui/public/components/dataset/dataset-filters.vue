<template>
  <v-slide-group
    v-model="currentFilter"
    show-arrows
    class="dataset-filters"
    :style="{maxWidth: maxWidth && (maxWidth + 'px')}"
  >
    <v-slide-item
      v-for="(filter,i) in value"
      :key="i"
      v-slot="{toggle}"
    >
      <v-chip
        v-if="!filter.hidden"
        :class="{'ml-1': i > 0}"
        close
        small
        :input-value="true"
        color="primary"
        outlined
        style="font-weight: bold;"
        :style="{height: '40px', borderRadius: '20px', lineHeight: '16px', maxWidth: (maxWidth - 16) + 'px'}"
        @click:close="removeFilter(i)"
        @click="toggle"
      >
        <div style="overflow: hidden;">
          <span style="display:inline-block;white-space:nowrap;">{{ (filter.field.title || filter.field['x-originalName'] || filter.field.key) }}</span>
          <br>
          <span style="display:inline-block">

            <template v-for="(label, j) of labels(filter)">
              <span
                :key="`operator-${i}-${j}`"
                v-html="label.operator"
              />
              {{ label.value }}
              {{ j < labels(filter).length - 1 ? ', ' : '' }}
            </template></span>
        </div>
      </v-chip>
    </v-slide-item>
  </v-slide-group>
</template>

<script>
export default {
  props: ['value', 'maxWidth'],
  data () {
    return {
      currentFilter: null
    }
  },
  methods: {
    removeFilter (i) {
      // necessary to force the slide group to show the last item event if it becomes hidden to the left
      this.currentFilter = i - 1
      this.value.splice(i, 1)
      this.$emit('input', this.value)
    },
    labels (filter) {
      let operator = '= '
      if (filter.type === 'nin' || filter.type === 'neq') operator = '&ne;'
      if (filter.type === 'starts') operator = 'commence par'
      let value = this.$root.$options.filters.cellValues(filter.values || filter.value, filter.field)
      if (filter.type === 'interval') {
        if (filter.minValue === '*' || !filter.minValue) {
          operator = '&leq;'
          value = this.$root.$options.filters.cellValues(filter.maxValue, filter.field)
        } else if (filter.maxValue === '*' || !filter.maxValue) {
          operator = '&GreaterEqual;'
          value = this.$root.$options.filters.cellValues(filter.minValue, filter.field)
        } else {
          return [
            { operator: '&GreaterEqual;', value: this.$root.$options.filters.cellValues(filter.minValue, filter.field) },
            { operator: '&leq;', value: this.$root.$options.filters.cellValues(filter.maxValue, filter.field) }
          ]
        }
      }
      if (filter.type === 'search') operator = 'contient les mots'
      if (filter.type === 'contains') operator = 'contient les caractères'
      return [{ operator, value }]
    }
  }
}
</script>

<style lang="css">
.dataset-filters .v-slide-group__prev, .dataset-filters .v-slide-group__next {
  min-width: 40px;
}

.dataset-filters .v-chip_content {
  max-width: 100%;
}
</style>
