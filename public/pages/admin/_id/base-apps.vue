<template lang="html">
  <v-container fluid>
    <p v-if="baseApps && baseApps.count === 0">Aucune application de base</p>
    <v-card v-else-if="baseApps">
      <v-list three-line>
        <v-list-tile v-for="baseApp in baseApps.results" :key="baseApp.id">
          <v-list-tile-content>
            <v-list-tile-title>
              {{ baseApp.title }} (<a :href="baseApp.url">{{ baseApp.url }}</a>)
            </v-list-tile-title>
            <v-list-tile-sub-title>{{ baseApp.description }}</v-list-tile-sub-title>
            <v-list-tile-sub-title>Jeux de données : {{ baseApp.datasetsFilter }} - Services distants: {{ baseApp.servicesFilter }}</v-list-tile-sub-title>
          </v-list-tile-content>
          <v-list-tile-action>
            <v-icon v-if="baseApp.public" color="green">lock_open</v-icon>
            <v-icon v-else color="red">lock</v-icon>
          </v-list-tile-action>
        </v-list-tile>
      </v-list>
    </v-card>
  </v-container>
</template>

<script>
export default {
  data() {
    return { baseApps: null }
  },
  async mounted() {
    this.baseApps = await this.$axios.$get('api/v1/base-applications?size=10000')
  }
}
</script>

<style lang="css">
</style>
