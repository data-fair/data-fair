<template lang="html">
  <v-layout row wrap>
    <v-flex xs12 sm5 md4 lg3 class="pb-0">
      <v-text-field v-model="filters.q" label="Rechercher" append-icon="search" @keyup.enter.native="writeParams" @click:append="writeParams"/>
    </v-flex>
    <v-spacer/>
    <!--<div>
      <v-btn-toggle v-if="!hideOwners" v-model="owners" multiple @change="writeParams">
        <v-btn v-if="user" :value="'user:' + user.id" flat>
          <v-icon>person</v-icon>
          <span>&nbsp;Personnels&nbsp;</span>
          <span v-if="facets">({{ ownerCount['user:' + user.id] || 0 }})</span>
        </v-btn>
        <v-btn v-for="orga in (user && user.organizations) || []" :value="'organization:' + orga.id" :key="orga.id" flat>
          <v-icon>group</v-icon>
          <span>&nbsp; {{ orga.name }} &nbsp;</span>
          <span v-if="facets">({{ ownerCount['organization:' + orga.id] || 0 }})</span>
        </v-btn>
        <v-btn v-if="user" flat value="others">
          <v-icon>public</v-icon>
          <span>&nbsp;Autres&nbsp;</span>
          <span v-if="facets">({{ ownerCount.others || 0 }})</span>
        </v-btn>
      </v-btn-toggle>
    </div>
    <v-spacer/>-->
    <v-flex xs12>
      <v-layout row wrap>
        <v-chip v-for="filter in Object.keys(fullFilterLabels)" v-if="filters[filter]" :key="filter" close small color="accent" text-color="white" @input="filters[filter] = null;writeParams(filter)">
          <strong v-if="filter === 'showAll'">Vue administrateur : {{ owners.length ? owners.join(', ') : 'tout voir' }}</strong>
          <strong v-else>{{ fullFilterLabels[filter] }} : {{ filters[filter] }}</strong>
        </v-chip>
      </v-layout>
    </v-flex>
  </v-layout>
</template>

<script>
import { mapActions, mapState } from 'vuex'

export default {
  props: ['filters', 'filterLabels', 'facets', 'type', 'hideOwners'],
  data: () => ({
    owners: []
  }),
  computed: {
    ...mapState('session', ['user']),
    fullFilterLabels() {
      return {
        ...this.filterLabels,
        showAll: 'Tout voir'
      }
    },
    ownerCount() {
      if (!this.facets) return {}
      if (this.hideOwners) return {}
      const others = this.facets.owner.filter(o => (o.value.type === 'user' && (!this.user || o.value.id !== this.user.id)) || (o.value.type === 'organization' && (!this.user || !this.user.organizations || !this.user.organizations.map(o => o.id).includes(o.value.id))))
      const counts = { others: others.map(f => f.count).reduce((total, count) => total + count, 0) }
      if (this.user) {
        const userCount = this.facets.owner.find(o => o.value.type === 'user' && o.value.id === this.user.id)
        if (userCount) Object.assign(counts, { ['user:' + this.user.id]: userCount.count });
        (this.user.organizations || []).forEach(orga => {
          const orgaCount = this.facets.owner.filter(o => o.value.type === 'organization' && o.value.id === orga.id).reduce((acc, val) => acc + val.count, 0)
          if (orgaCount) Object.assign(counts, { ['organization:' + orga.id]: orgaCount })
        })
      }
      return counts
    }
  },
  watch: {
    '$route'() {
      this.readParams()
    }
  },
  created() {
    this.readParams()
  },
  methods: {
    ...mapActions(['searchQuery']),
    readParams() {
      Object.keys(this.fullFilterLabels).forEach(key => {
        this.$set(this.filters, key, this.$route.query[key])
      })
      this.$set(this.filters, 'q', this.$route.query.q)
      if (this.$route.query.owner) {
        this.owners = this.$route.query.owner.split(',')
        if (this.user) this.$set(this.filters, 'owner', this.$route.query.owner.replace('others', '-user:' + this.user.id + ',' + this.user.organizations.map(o => '-organization:' + o.id).join(',')))
      } else {
        this.$set(this.filters, 'owner', null)
      }
      this.$emit('apply')
    },
    writeParams() {
      const query = { ...this.$route.query }
      Object.keys(this.filters).forEach(key => {
        if (![null, undefined, '', true].includes(this.filters[key])) query[key] = '' + this.filters[key]
        else delete query[key]
      })
      if (this.owners.length) query.owner = this.owners.join(',').replace()
      else query.owner = null
      this.$router.push({ query })
      this.searchQuery({ type: this.type, query })
    }
  }
}
</script>

<style lang="css">
</style>
