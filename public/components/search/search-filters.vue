<template lang="html">
  <v-col>
    <v-row class="mt-1">
      <v-text-field
        v-model="filters.q"
        :placeholder="$t('search')"
        outlined
        dense
        color="primary"
        append-icon="mdi-magnify"
        hide-details
        @keyup.enter.native="writeParams"
        @click:append="writeParams"
      />
      <v-card
        v-if="user.adminMode"
        color="admin"
        dark
        flat
        class="mt-2"
      >
        <v-card-text class="pa-1">
          <v-switch
            v-model="filters.shared"
            :label="$t('showShared')"
            hide-details
            dense
            class="mt-0"
            @change="writeParams"
          />
        </v-card-text>
      </v-card>
    </v-row>
    <v-row class="mb-1">
      <template v-for="filter in Object.keys(filterLabels)">
        <v-chip
          v-if="filters[filter]"
          :key="filter"
          close
          small
          color="accent"
          text-color="white"
          @click:close="filters[filter] = null;writeParams(filter)"
        >
          <strong>{{ filterLabels[filter] }} : {{ filters[filter] }}</strong>
        </v-chip>
      </template>
    </v-row>
    <v-row v-if="sorts">
      <v-select
        v-model="filters.sort"
        :label="$t('sortBy')"
        :items="sorts"
        dense
        class="mt-2"
        @change="writeParams"
      />
    </v-row>
  </v-col>
</template>

<i18n lang="yaml">
fr:
  adminVue: "Vue administrateur :"
  search: Rechercher
  showShared: inclure les resources des autres comptes
  sortBy: trier par
en:
  adminVue: "Admin vue :"
  search: Search
  showShared: include resources from other accounts
  sortBy: sort by
</i18n>

<script>
import { mapActions, mapState, mapGetters } from 'vuex'

export default {
  props: ['filters', 'filterLabels', 'type', 'hideOwners', 'sorts'],
  data: () => ({
    owners: []
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount'])
  },
  watch: {
    '$route' () {
      this.readParams()
    }
  },
  mounted () {
    this.readParams()
  },
  methods: {
    ...mapActions(['searchQuery']),
    readParams () {
      Object.keys(this.filterLabels).forEach(key => {
        this.$set(this.filters, key, this.$route.query[key])
      })
      this.$set(this.filters, 'q', this.$route.query.q)
      if (this.$route.query.owner) {
        this.owners = this.$route.query.owner.split(',')
      }
      this.$set(this.filters, 'shared', this.$route.query.shared === 'true')
      if (this.sorts) {
        this.$set(this.filters, 'sort', this.$route.query.sort || 'createdAt:-1')
      }
      this.$emit('apply')
    },
    writeParams () {
      const query = { ...this.$route.query }
      Object.keys(this.filters).forEach(key => {
        if (![null, undefined, '', true].includes(this.filters[key])) query[key] = '' + this.filters[key]
        else delete query[key]
      })
      if (this.filters.shared) query.shared = 'true'
      else delete query.shared
      if (this.owners.length) query.owner = this.owners.join(',').replace()
      else delete query.owner
      if (this.sorts && this.filters.sort) query.sort = this.filters.sort
      else delete query.sort
      this.$router.push({ query })
      this.searchQuery({ type: this.type, query })
    }
  }
}
</script>

<style lang="css">
</style>
