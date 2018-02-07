<template>
  <div class="dataset" v-if="dataset">
    <md-tabs md-fixed class="md-transparent" ref="tabs" @change="changeTab">
      <md-tab md-label="Description" md-icon="toc" id="description" :md-active="activeTab === 'description'">
        <dataset-info :dataset="dataset" @changed="save(['title', 'description', 'license', 'origin'])"/>
        <schema :dataset="dataset" @schema-updated="saveSchema($event)"/>
      </md-tab>

      <md-tab md-label="Vue tableau" md-icon="view_list" id="tabular" :md-active="activeTab === 'tabular'">
        <tabular-view :dataset="dataset" v-if="dataset && activeTab === 'tabular'"/>
      </md-tab>

      <md-tab md-label="Permissions" md-icon="security" id="permissions" :md-active="activeTab === 'permissions'">
        <permissions :resource="dataset" :resource-url="resourceUrl" :api="api"/>
      </md-tab>

      <md-tab md-label="Enrichissement" md-icon="merge_type" id="extend" :md-active="activeTab === 'extend'">
        <enrich-dataset :dataset="dataset"/>
      </md-tab>

      <md-tab md-label="Journal" md-icon="event_note" id="journal" :md-active="activeTab === 'journal'">
        <journal :dataset="dataset"/>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" id="api" :md-active="activeTab === 'api'">
        <open-api v-if="api && activeTab === 'api'" :api="api"/>
      </md-tab>
    </md-tabs>

    <div class="actions-buttons">
      <div style="margin-top: 100px">
        <md-button class="md-icon-button md-raised md-primary" :href="downloadLink">
          <md-icon>file_download</md-icon>
          <md-tooltip md-direction="left">Télécharger les données brutes</md-tooltip>
        </md-button>
      </div>
      <div>
        <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
          <md-icon>delete</md-icon>
          <md-tooltip md-direction="left">Supprimer ce jeu de données</md-tooltip>
        </md-button>
      </div>
    </div>

    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression du jeu de données</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer le jeux de données <code>{{ dataset.title }}</code> ? La suppression est définitive et les données ne pourront pas être récupérées.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import Permissions from '../components/Permissions.vue'
import Journal from '../components/Journal.vue'
import Schema from '../components/Schema.vue'
import TabularView from '../components/TabularView.vue'
import EnrichDataset from '../components/EnrichDataset.vue'
import DatasetInfo from '../components/DatasetInfo.vue'
import OpenApi from 'vue-openapi'

export default {
  name: 'Dataset',
  components: {
    Permissions,
    Journal,
    Schema,
    TabularView,
    EnrichDataset,
    OpenApi,
    DatasetInfo
  },
  data: () => ({
    dataset: null,
    activeTab: null,
    api: null
  }),
  computed: {
    downloadLink() {
      if (this.dataset) return this.resourceUrl + '/raw/' + this.dataset.file.name
    },
    resourceUrl() {
      return window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId
    }
  },
  mounted() {
    this.activeTab = this.$route.query.tab || 'description'
    this.$http.get(this.resourceUrl).then(result => {
      this.dataset = result.data
      this.$http.get(this.resourceUrl + '/api-docs.json').then(response => {
        this.api = response.body
      })
    })
  },
  methods: {

    save(keys) {
      const patch = Object.assign({}, ...keys.map(key => ({ [key]: this.dataset[key] })))
      this.$store.dispatch('patchDataset', {dataset: this.dataset, patch})
    },
    saveSchema(schema) {
      this.$store.dispatch('patchDataset', {dataset: this.dataset, patch: {schema}})
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(this.resourceUrl).then(result => {
        this.$store.dispatch('notify', `Le jeu de données ${this.dataset.title} a bien été supprimé`)
        this.$router.push({name: 'Datasets'})
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression du jeu de données ${this.dataset.title}`)
      })
    },
    changeTab(event) {
      this.activeTab = this.$refs.tabs.activeTab
      this.$router.push({query: {tab: this.$refs.tabs.activeTab}})
    }
  }
}
</script>

<style>
.dataset .action{
  height: calc(100vh - 64px);
}
</style>
