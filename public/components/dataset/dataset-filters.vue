<template>
  <v-slide-group
    v-model="currentFilter"
    show-arrows
  >
    <v-slide-item
      v-for="(filter,i) in value"
      :key="i"
      v-slot="{toggle}"
    >
      <v-chip
        class="ml-3"
        close
        small
        :input-value="true"
        color="primary"
        outlined
        style="font-weight: bold;"
        @click:close="removeFilter(i)"
        @click="toggle"
      >
        {{ label(filter) }}
      </v-chip>
    </v-slide-item>
  </v-slide-group>
</template>

<script>
export default {
  props: ['value'],
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
    label (filter) {
      const field = filter.field.title || filter.field['x-originalName'] || filter.field.key
      let operator = 'égal à'
      if (filter.type === 'starts') operator = 'commence par'
      let value = this.$root.$options.filters.cellValues(filter.values || filter.value, filter.field)
      if (filter.type === 'interval') {
        if (filter.minValue === '*') {
          operator = 'inférieur ou égal à'
          value = this.$root.$options.filters.cellValues(filter.maxValue, filter.field)
        } else if (filter.maxValue === '*') {
          operator = 'supérieur ou égal à'
          value = this.$root.$options.filters.cellValues(filter.minValue, filter.field)
        } else {
          operator = 'compris entre'
          value = this.$root.$options.filters.cellValues(filter.minValue, filter.field) +
            ' et ' + this.$root.$options.filters.cellValues(filter.maxValue, filter.field)
        }
      }
      if (filter.type === 'search') operator = 'contient des mots'
      return `${field} ${operator} ${value}`
    }
  }
}
</script>

<style lang="css" scoped>
</style>
