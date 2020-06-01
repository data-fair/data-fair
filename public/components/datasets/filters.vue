<template>
  <v-row v-if="value.length">
    <v-col cols="12" class="pb-0 pt-1">
      <v-slide-group multiple show-arrows>
        <v-slide-item
          v-for="(filter,i) in value"
          :key="i"
          v-slot:default="{}"
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
          >
            {{ filter.field.title || filter.field['x-originalName'] || filter.key }} = {{ filter.values.join(', ') }}
          </v-chip>
        </v-slide-item>
      </v-slide-group>
    </v-col>
  </v-row>
</template>

<script>
  export default {
    props: ['value'],
    methods: {
      removeFilter(i) {
        this.value.splice(i, 1)
        this.$emit('input', this.value)
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
