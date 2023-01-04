<template lang="html">
  <v-container v-if="initialized">
    <v-row>
      <v-col>
        <template v-if="authorized">
          <h2 class="mb-2">
            {{ $t('statistics') }}
          </h2>
          <v-sheet :loading="!stats">
            <v-data-table
              :loading="!stats"
              :loading-text="$t('loading')"
              :headers="headers"
              :items="stats ? [stats] : []"
              hide-default-footer
            >
              <template #item="{item}">
                <tr>
                  <td>
                    {{ item.limits.nb_datasets.consumption.toLocaleString() }}
                    <template v-if="item.limits.nb_datasets.limit !== -1">
                      / {{ item.limits.nb_datasets.limit.toLocaleString() }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>
                    {{ item.limits.store_bytes.consumption | bytes($i18n.locale) }}
                    <template v-if="item.limits.store_bytes.limit !== -1">
                      / {{ item.limits.store_bytes.limit | bytes($i18n.locale) }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>
                    {{ item.limits.indexed_bytes.consumption | bytes($i18n.locale) }}
                    <template v-if="item.limits.indexed_bytes.limit !== -1">
                      / {{ item.limits.indexed_bytes.limit | bytes($i18n.locale) }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>{{ item.applications.toLocaleString() }}</td>
                </tr>
              </template>
            </v-data-table>
          </v-sheet>

          <storage-treemap
            v-if="stats && datasets"
            :stats="stats"
            :datasets="{count: datasets.count, results: datasets.results.slice(0, 15)}"
            class="mt-2"
          />

          <h2 class="my-2">
            {{ $t('details') }}
          </h2>
          <storage-details
            v-if="datasets"
            :datasets="datasets.results"
          />
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

<i18n lang="yaml">
fr:
  statistics: Statistiques
  details: Détail par jeu de données
  loading: Chargement en cours...
  allowed: autorisés
en:
  statistics: Statistics
  details: Details per dataset
  loading: Loading...
  allowed: allowed
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  data: () => ({
    datasets: null,
    stats: null,
    headers: [
      { text: 'Nombre de jeux de données', value: 'datasets', sortable: false },
      { text: 'Espace de stockage', value: 'storage', sortable: false },
      { text: 'Données indexées', value: 'storageLimit', sortable: false },
      { text: 'Nombre de applications', value: 'applications', sortable: false }
    ]
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters('session', ['activeAccount']),
    authorized () {
      return !!this.user
    }
  },
  async created () {
    if (!this.authorized) return
    this.datasets = (await this.$axios.$get('api/v1/datasets', { params: { size: 10000, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title,storage', sort: 'storage.size:-1' } }))
    this.stats = await this.$axios.$get('api/v1/stats')
  }
}
</script>

<style lang="css">
</style>
