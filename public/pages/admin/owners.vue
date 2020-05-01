<template lang="html">
  <v-container fluid>
    <h2 class="title">
      Propriétaires
    </h2>

    <v-row
      v-if="owners"
      column
    >
      <v-row>
        <v-col
          cols="12"
          sm="6"
          md="4"
          lg="3"
        >
          <v-text-field
            v-model="q"
            name="q"
            label="Rechercher par le nom"
            @keypress.enter="refresh"
          />
        </v-col>
      </v-row>
      <v-card v-if="owners.results.length">
        <v-list three-line>
          <v-list-item
            v-for="owner in owners.results"
            :key="owner.id"
          >
            <v-list-item-content>
              <v-list-item-title>
                {{ owner.name }} ({{ owner.type }})
              </v-list-item-title>
              <v-list-item-sub-title>
                <span v-if="owner.consumption && (owner.consumption.storage !== undefined)">{{ parseFloat(((owner.consumption && owner.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} ko stockés</span>
                <span v-if="owner.storage !== undefined">pour une limite à {{ parseFloat((owner.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
              </v-list-item-sub-title>
              <v-list-item-sub-title>
                <nuxt-link :to="{path: '/datasets', query: {owner: `${owner.type}:${owner.id}`, showAll: true}}">
                  {{ owner.nbDatasets }} jeux de données
                </nuxt-link>
                -
                <nuxt-link :to="{path: '/applications', query: {owner: `${owner.type}:${owner.id}`, showAll: true}}">
                  {{ owner.nbApplications }} applications
                </nuxt-link>
              </v-list-item-sub-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card>
    </v-row>
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
      },
    },
  }
</script>

<style lang="css">
</style>
