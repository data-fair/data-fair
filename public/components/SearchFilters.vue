<template lang="html">
  <v-layout row wrap>
    <v-flex xs12 sm5 md4 lg3 class="pb-0">
      <v-text-field label="Rechercher" v-model="filters.q" append-icon="search" @keyup.enter.native="writeParams" @click:append="writeParams"/>
    </v-flex>
    <v-spacer/>
    <div>
      <v-btn-toggle v-model="owners" @change="writeParams" multiple>
        <v-btn v-if="user" :value="'user:' + user.id" flat>
          <v-icon>person</v-icon>
          <span>&nbsp;Personnels&nbsp;</span>
          <span v-if="facets">({{ ownerCount['user:' + user.id] || 0 }})</span>
        </v-btn>
        <v-btn flat :value="'organization:' + orga.id" v-for="orga in (user && user.organizations) || []" :key="orga.id">
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
    <v-spacer/>
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
  props: ['filters', 'filterLabels', 'facets'],
  data: () => ({
    owners: []
  }),
  computed: {
    user() {
      return this.$store.state.session && this.$store.state.session.user
    },
    ownerCount() {
      if (!this.facets) return {}
      const others = this.facets.owner.filter(o => (o.value.type === 'user' && (!this.user || o.value.id !== this.user.id)) || (o.value.type === 'organization' && (!this.user || !this.user.organizations || !this.user.organizations.map(o => o.id).includes(o.value.id))))
      const counts = {others: others.map(f => f.count).reduce((total, count) => total + count, 0)}
      if (this.user) {
        const userCount = this.facets.owner.find(o => o.value.type === 'user' && o.value.id === this.user.id)
        if (userCount) Object.assign(counts, {['user:' + this.user.id]: userCount.count});
        (this.user.organizations || []).forEach(orga => {
          const orgaCount = this.facets.owner.find(o => o.value.type === 'organization' && o.value.id === orga.id)
          if (orgaCount) Object.assign(counts, {['organization:' + orga.id]: orgaCount.count})
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
    readParams() {
      Object.keys(this.filterLabels).forEach(key => {
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
      const query = {...this.$route.query}
      Object.keys(this.filters).forEach(key => {
        if (![null, undefined, '', true].includes(this.filters[key])) query[key] = '' + this.filters[key]
        else delete query[key]
      })
      if (this.owners.length) query.owner = this.owners.join(',').replace()
      else delete query.owner
      this.$router.push({ query })
    }
  }
}
</script>

<style lang="css">
</style>
