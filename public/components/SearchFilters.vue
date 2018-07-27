<template lang="html">
  <v-layout row wrap>
    <v-chip close small color="accent" text-color="white" v-for="filter in Object.keys(filterLabels)" :key="filter" v-if="filters[filter]" @input="removeFilter(filter)">
      <strong>{{ filterLabels[filter] }} : {{ filters[filter] }}</strong>
    </v-chip>
  </v-layout>
</template>

<script>
export default {
  props: ['filters', 'filterLabels'],
  watch: {
    '$route'() {
      this.setFilters()
    }
  },
  created() {
    this.setFilters()
  },
  methods: {
    removeFilter(key) {
      const query = {...this.$route.query}
      delete query[key]
      this.$router.push({ query })
    },
    setFilters() {
      Object.keys(this.filterLabels).forEach(key => {
        this.$set(this.filters, key, this.$route.query[key])
      })
      this.$emit('apply')
    }
  }
}
</script>

<style lang="css">
</style>
