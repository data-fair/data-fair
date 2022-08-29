<template lang="html">
  <v-row dense>
    <v-col
      cols="12"
      md="6"
      lg="12"
    >
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
    </v-col>
    <v-col
      v-if="sorts"
      cols="12"
      md="6"
      lg="12"
    >
      <v-card
        v-if="user.adminMode"
        color="admin"
        dark
        flat
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
    </v-col>
    <v-col
      v-if="Object.keys(filterLabels).filter(f => filters[f]).length"
      cols="12"
      md="6"
      lg="12"
    >
      <template v-for="filter in Object.keys(filterLabels).filter(f => filters[f])">
        <v-chip
          :key="filter"
          close
          small
          color="accent"
          text-color="white"
          style="height:auto;white-space:normal;"
          @click:close="filters[filter] = null;writeParams(filter)"
        >
          <strong>{{ filterLabels[filter] }} : {{ filters[filter] }}</strong>
        </v-chip>
      </template>
    </v-col>
    <v-col
      v-if="sorts"
      cols="12"
      md="6"
      lg="12"
    >
      <v-select
        v-model="filters.sort"
        :label="$t('sortBy')"
        :items="sorts"
        outlined
        dense
        hide-details
        @change="writeParams"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  adminVue: "Admin : "
  search: Rechercher
  showShared: inclure les resources des autres comptes
  sortBy: trier par
en:
  adminVue: "Admin: "
  search: Search
  showShared: include resources from other accounts
  sortBy: sort by
</i18n>

<script>
import { mapActions, mapState, mapGetters } from 'vuex'

export default {
  props: ['filters', 'filterLabels', 'type', 'hideOwners', 'sorts'],
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
      this.$set(this.filters, 'shared', this.$route.query.shared === 'true')
      if (this.sorts) this.$set(this.filters, 'sort', this.$route.query.sort || 'createdAt:-1')
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
      if (this.filters.owners) query.owner = this.filters.owners
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
