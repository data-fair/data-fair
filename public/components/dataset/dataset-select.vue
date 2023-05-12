<template>
  <v-autocomplete
    :items="datasets"
    :loading="loadingDatasets"
    :search-input.sync="search"
    item-text="title"
    item-value="id"
    :label="label || $t('selectDataset')"
    :placeholder="$t('search')"
    return-object
    outlined
    dense
    hide-details
    style="max-width: 600px"
    clearable
    @change="dataset => $emit('change', dataset)"
  >
    <template #item="{item}">
      <dataset-list-item
        :dataset="item"
        :dense="true"
        :show-topics="true"
        :no-link="true"
      />
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
  masterData: Données de référence
  ownerDatasets: Vos jeux de données
en:
  selectDataset: Chose a dataset
  lines: "no line | 1 line | {count} lines"
  error: Error status
  masterData: Master data
  ownerDatasets: Your datasets
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  props: {
    label: { type: String, default: '' },
    extraParams: { type: Object, default: () => ({}) },
    owner: { type: Object, default: null },
    masterData: { type: String, default: null }
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
    },
    owner () {
      this.searchDatasets()
    },
    extraParams () {
      this.searchDatasets()
    }
  },
  methods: {
    async searchDatasets () {
      this.loadingDatasets = true
      const owner = this.owner || this.activeAccount

      let items = []
      if (this.masterData) {
        const remoteServicesRes = await this.$axios.$get('api/v1/remote-services', {
          params: { q: this.search, size: 1000, select: 'id,title,' + this.masterData, privateAccess: `${owner.type}:${owner.id}`, [this.masterData]: true }
        })
        const refDatasets = remoteServicesRes.results.map(r => r[this.masterData].parent || r[this.masterData].dataset)
        if (refDatasets.length) {
          items.push({ header: this.$t('masterData') })
          items = items.concat(refDatasets)
        }
      }

      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department) ownerFilter += `:${owner.department}`
      // WARNING: order is important here, extraParams can overwrite the owner filter
      const res = await this.$axios.$get('api/v1/datasets', {
        params: {
          q: this.search,
          size: 20,
          select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner',
          owner: ownerFilter,
          ...this.extraParams
        }
      })

      if (items.length && res.results.length) {
        items.push({ header: this.$t('ownerDatasets') })
      }
      items = items.concat(res.results)

      this.datasets = items
      this.loadingDatasets = false
    }
  }
}
</script>

<style>

</style>
