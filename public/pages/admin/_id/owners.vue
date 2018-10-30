<template lang="html">
  <v-container fluid>
    <p v-if="quotas && quotas.count === 0">Aucun quota enregistré</p>
    <v-card v-else-if="quotas">
      <v-list two-line>
        <v-list-tile v-for="quota in quotas.results" :key="quota.id">
          <v-list-tile-content>
            <v-list-tile-title>
              {{ quota.name }} ({{ quota.type }})
            </v-list-tile-title>
            <v-list-tile-sub-title>Stockage : {{ quota.storage }}</v-list-tile-sub-title>
          </v-list-tile-content>
        </v-list-tile>
      </v-list>
    </v-card>
  </v-container>
</template>

<script>
export default {
  data() {
    return { quotas: null }
  },
  async mounted() {
    this.quotas = await this.$axios.$get('api/v1/quotas', { params: { size: 1000 } })
  }
}
</script>

<style lang="css">
</style>
