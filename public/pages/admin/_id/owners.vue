<template lang="html">
  <v-container fluid>
    <v-layout v-if="quotas" column>
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
      <v-card v-if="quotas.results.length">
        <v-list two-line>
          <v-list-tile v-for="quota in quotas.results" :key="quota.id">
            <v-list-tile-content>
              <v-list-tile-title>
                {{ quota.name }} ({{ quota.type }})
              </v-list-tile-title>
              <v-list-tile-sub-title>
                <span v-if="quota.consumption && (quota.consumption.storage !== undefined)">{{ parseFloat(((quota.consumption && quota.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} ko stockés</span>
                <span v-if="quota.storage !== undefined">pour une limite à {{ parseFloat((quota.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
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
    return { quotas: null, q: null }
  },
  async mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.quotas = await this.$axios.$get('api/v1/quotas', { params: { size: 1000, q: this.q } })
    }
  }
}
</script>

<style lang="css">
</style>
