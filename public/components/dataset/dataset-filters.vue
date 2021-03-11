<template>
  <v-slide-group
    v-model="currentFilter"
    show-arrows
  >
    <v-slide-item
      v-for="(filter,i) in value"
      :key="i"
      v-slot:default="{toggle}"
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
        {{ filter.field.title || filter.field['x-originalName'] || filter.field.key }} = {{ filter.values.join(', ') }}
      </v-chip>
    </v-slide-item>
  </v-slide-group>
</template>

<script>
  export default {
    props: ['value'],
    data() {
      return {
        currentFilter: null,
      }
    },
    methods: {
      removeFilter(i) {
        // necessary to force the slide group to show the last item event if it becomes hidden to the left
        this.currentFilter = i - 1
        this.value.splice(i, 1)
        this.$emit('input', this.value)
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
