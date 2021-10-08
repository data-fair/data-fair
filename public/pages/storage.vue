<template lang="html">
  <v-container v-if="initialized">
    <v-row>
      <v-col>
        <template v-if="authorized">
          <h2 class="mb-2">
            Statistiques
          </h2>
          <v-sheet :loading="!stats">
            <v-data-table
              :loading="!stats"
              loading-text="Chargement en cours..."
              :headers="headers"
              :items="stats ? [stats] : []"
              hide-default-footer
            >
              <template v-slot:item="{item}">
                <tr>
                  <td>{{ item.datasets }}</td>
                  <td>{{ item.storage | displayBytes($i18n.locale) }}</td>
                  <td>{{ item.storageLimit | displayBytes($i18n.locale) }}</td>
                  <td>{{ item.applications }}</td>
                </tr>
              </template>
            </v-data-table>
          </v-sheet>

          <h2 class="my-2">
            Détail par jeu de données
          </h2>
          <storage-details v-if="datasets" :datasets="datasets" />
          <v-progress-linear
            v-else
            :height="2"
            indeterminate
          />
        </template>

        <layout-not-authorized v-else />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'

  export default {
    data: () => ({
      datasets: null,
      stats: null,
      headers: [
        { text: 'Nombre de jeux de données', value: 'datasets', sortable: false },
        { text: 'Espace consommé', value: 'storage', sortable: false },
        { text: 'Espace total disponible', value: 'storageLimit', sortable: false },
        { text: 'Nombre de visualisations', value: 'applications', sortable: false },
      ],
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters('session', ['activeAccount']),
      authorized() {
        return !!this.user
      },
    },
    async created() {
      if (!this.authorized) return
      this.datasets = (await this.$axios.$get('api/v1/datasets', { params: { size: 10000, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title,storage', sort: 'storage.size:-1' } })).results
      this.stats = await this.$axios.$get('api/v1/stats')
    },
  }
</script>

<style lang="css">
</style>
