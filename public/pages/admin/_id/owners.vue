<template lang="html">
  <v-container fluid>
    <v-layout v-if="owners" column>
      <v-layout row wrap>
        <v-flex xs12 sm6 md4 lg3>
          <v-text-field
            v-model="q"
            name="q"
            label="Rechercher par le nom"
            @keypress.enter="refresh"
          />
        </v-flex>
      </v-layout>
      <v-card v-if="owners.results.length">
        <v-list three-line>
          <v-list-tile v-for="owner in owners.results" :key="owner.id">
            <v-list-tile-content>
              <v-list-tile-title>
                {{ owner.name }} ({{ owner.type }})
              </v-list-tile-title>
              <v-list-tile-sub-title>
                <span v-if="owner.consumption && (owner.consumption.storage !== undefined)">{{ parseFloat(((owner.consumption && owner.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} ko stockés</span>
                <span v-if="owner.storage !== undefined">pour une limite à {{ parseFloat((owner.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
              </v-list-tile-sub-title>
              <v-list-tile-sub-title>
                <nuxt-link :to="{path: '/datasets', query: {owner: `${owner.type}:${owner.id}`, showAll: true}}">{{ owner.nbDatasets }} jeux de données</nuxt-link>
                -
                <nuxt-link :to="{path: '/applications', query: {owner: `${owner.type}:${owner.id}`, showAll: true}}">{{ owner.nbApplications }} applications</nuxt-link>
              </v-list-tile-sub-title>
            </v-list-tile-content>
          </v-list-tile>
        </v-list>
      </v-card>
    </v-layout>
  </v-container>
</template>

<script>
export default {
  data() {
    return { owners: null, q: null }
  },
  async mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.owners = await this.$axios.$get('api/v1/admin/owners', { params: { size: 1000, q: this.q } })
    }
  }
}
</script>

<style lang="css">
</style>
