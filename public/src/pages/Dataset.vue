<template>
  <div class="dataset" v-if="dataset">
    <md-tabs md-fixed class="md-transparent" ref="tabs" @change="changeTab">
      <md-tab md-label="Description" md-icon="toc" id="description" :md-active="activeTab === 'description'">
        <dataset-info/>
        <schema v-if="dataset"/>
      </md-tab>

      <md-tab md-label="Vue tableau" md-icon="view_list" id="tabular" :md-active="activeTab === 'tabular'">
        <tabular-view v-if="dataset && activeTab === 'tabular'"/>
      </md-tab>

      <md-tab md-label="Permissions" v-if="isOwner" md-icon="security" id="permissions" :md-active="activeTab === 'permissions'">
        <permissions :resource="dataset" :resource-url="resourceUrl" :api="api"/>
      </md-tab>

      <md-tab md-label="Enrichissement" md-icon="merge_type" id="extend" :md-active="activeTab === 'extend'">
        <enrich-dataset v-if="dataset && activeTab === 'extend'"/>
      </md-tab>

      <md-tab md-label="Journal" md-icon="event_note" id="journal" :md-active="activeTab === 'journal'">
        <journal v-if="dataset && activeTab === 'journal'"/>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" id="api" :md-active="activeTab === 'api'">
        <open-api v-if="api && activeTab === 'api'" :api="api"/>
      </md-tab>
    </md-tabs>

    <div class="actions-buttons">
      <div style="margin-top: 100px">
        <md-menu md-size="4" md-direction="bottom left" ref="downloadMenu">
          <md-button class="md-icon-button md-raised md-primary" md-menu-trigger>
            <md-icon>file_download</md-icon>
          </md-button>

          <md-menu-content>
            <md-menu-item :href="downloadLink">
              <span>Fichier d'origine</span>
            </md-menu-item>
            <md-menu-item :href="downloadFullLink">
              <span>Fichier enrichi</span>
            </md-menu-item>
          </md-menu-content>
        </md-menu>
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
        <md-button class="md-warn md-raised" @click="confirmRemove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import {mapState, mapActions, mapGetters} from 'vuex'

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
    activeTab: null
  }),
  computed: {
    ...mapState('dataset', ['dataset', 'api']),
    ...mapGetters('dataset', ['resourceUrl', 'isOwner']),
    downloadLink() {
      if (this.dataset) return this.resourceUrl + '/raw'
    },
    downloadFullLink() {
      if (this.dataset) return this.resourceUrl + '/full'
    }
  },
  mounted() {
    this.activeTab = this.$route.query.tab || 'description'
    this.setId(this.$route.params.datasetId)
    this.fetchVocabulary()
  },
  methods: {
    ...mapActions(['fetchVocabulary']),
    ...mapActions('dataset', ['setId', 'patch', 'remove']),
    async confirmRemove() {
      this.$refs['delete-dialog'].close()
      await this.remove()
      this.$router.push({name: 'Datasets'})
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
