<template>
  <v-autocomplete
    :items="datasets"
    :loading="loadingDatasets"
    :search-input.sync="search"
    hide-no-data
    item-text="title"
    item-value="id"
    :label="label || $t('selectDataset')"
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
      <dataset-list-item
        :dataset="item"
        :dense="true"
        :show-topics="true"
        :no-link="true"
      >
        {{ dataset }}
      </dataset-list-item>
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
  props: {
    select: { type: String, default: '' }
  },
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
        params: { q: this.search, size: 20, select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner', owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
      })
      this.datasets = res.results
      this.loadingDatasets = false
    }
  }
}
</script>

<style>

</style>
