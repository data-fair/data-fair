<template>
  <v-autocomplete
    :items="datasets"
    :loading="loadingDatasets"
    :search-input.sync="search"
    hide-no-data
    item-text="title"
    item-value="id"
    :label="$t('selectDataset')"
    :placeholder="$t('search')"
    return-object
    outlined
    dense
    hide-details
    style="max-width: 700px"
    class="pl-2"
    clearable
    @change="dataset => $emit('change', dataset)"
  >
    <template #item="{item}">
      <v-list-item-avatar
        v-if="item.status === 'error'"
        class="mr-0"
      >
        <v-tooltip top>
          <template #activator="{on}">
            <v-icon
              color="error"
              v-on="on"
            >
              mdi-alert
            </v-icon>
          </template>
          {{ $t('error') }}
        </v-tooltip>
      </v-list-item-avatar>
      <v-list-item-avatar>
        <visibility :visibility="item.visibility" />
      </v-list-item-avatar>
      <v-list-item-content>
        <v-list-item-title>{{ item.title }} ({{ item.id }})</v-list-item-title>
        <v-list-item-subtitle>
          <span v-text="$tc('lines', item.count)" />
        </v-list-item-subtitle>
      </v-list-item-content>
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
en:
  selectDataset: Chose a dataset
  lines: "no line | 1 line | {count} lines"
  error: Error status
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  data: () => ({
    loadingDatasets: false,
    search: '',
    datasets: []
  }),
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  watch: {
    search () {
      this.searchDatasets()
    }
  },
  methods: {
    async searchDatasets () {
      this.loadingDatasets = true
      const res = await this.$axios.$get('api/v1/datasets', {
        params: { q: this.search, size: 20, select: 'id,title,status,count', owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
      })
      this.datasets = res.results
      this.loadingDatasets = false
    }
  }
}
</script>

<style>

</style>
