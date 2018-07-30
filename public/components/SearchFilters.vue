<template lang="html">
  <v-layout row wrap>
    <v-flex xs12 sm5 md4 lg3 class="pb-0">
      <v-text-field label="Rechercher" v-model="filters.q" append-icon="search" @keyup.enter.native="writeParams" @click:append="writeParams"/>
    </v-flex>
    <v-spacer/>
    <v-flex xs12 sm7 md6 lg5 class="pb-0">
      <v-switch label="Uniquement ce dont je suis propriétaire" v-model="filters['is-owner']" @change="writeParams"/>
    </v-flex>
    <v-flex xs12>
      <v-layout row wrap>
        <v-chip close small color="accent" text-color="white" v-for="filter in Object.keys(filterLabels)" :key="filter" v-if="filters[filter]" @input="filters[filter] = null;writeParams(filter)">
          <strong>{{ filterLabels[filter] }} : {{ filters[filter] }}</strong>
        </v-chip>
      </v-layout>
    </v-flex>
  </v-layout>
</template>

<script>
export default {
  props: ['filters', 'filterLabels'],
  watch: {
    '$route'() {
      this.readParams()
    }
  },
  created() {
    this.readParams()
  },
  methods: {
    readParams() {
      Object.keys(this.filterLabels).forEach(key => {
        this.$set(this.filters, key, this.$route.query[key])
      })
      this.$set(this.filters, 'q', this.$route.query.q)
      this.$set(this.filters, 'is-owner', this.$route.query['is-owner'] !== 'false')
      this.$emit('apply')
    },
    writeParams() {
      const query = {...this.$route.query}
      Object.keys(this.filters).forEach(key => {
        if (![null, undefined, '', true].includes(this.filters[key])) query[key] = '' + this.filters[key]
        else delete query[key]
      })
      this.$router.push({ query })
    }
  }
}
</script>

<style lang="css">
</style>
