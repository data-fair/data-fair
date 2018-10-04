<template lang="html">
  <v-container fluid>
    <p v-if="errors && errors.total === 0">Aucun jeu de données en erreur</p>
    <v-card v-else-if="errors">
      <v-list two-line>
        <v-list-tile v-for="error in errors.results" :key="error.id">
          <v-list-tile-content>
            <v-list-tile-title>
              <nuxt-link :to="`/dataset/${error.id}/description`">{{ error.title }} ({{ error.owner.name }})</nuxt-link>
            </v-list-tile-title>
            <v-list-tile-sub-title>{{ error.event.data }} ({{ error.event.date | moment("DD/MM/YYYY, HH:mm") }})</v-list-tile-sub-title>
          </v-list-tile-content>
        </v-list-tile>
      </v-list>
    </v-card>
  </v-container>
</template>

<script>
export default {
  data() {
    return { errors: null }
  },
  async mounted() {
    this.errors = await this.$axios.$get('api/v1/admin/errors')
  }
}
</script>

<style lang="css">
</style>
