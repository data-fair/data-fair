<template>
<md-layout md-align="center" class="dataset" v-if="dataset">
  <md-layout md-column md-flex="85" md-flex-offset="5">
    <md-tabs md-fixed class="md-transparent" @change="$router.push({query:{tab:$event}})">
      <md-tab md-label="Description" md-icon="toc" :md-active="activeTab === '0'">
        <h3 class="md-headline">Informations</h3>
        <md-layout md-row>
          <md-layout md-column md-flex="45">
            <md-input-container>
              <label>Titre</label>
              <md-input v-model="dataset.title" @blur="save"></md-input>
            </md-input-container>
            <md-input-container>
              <label>Description</label>
              <md-textarea v-model="dataset.description" @blur="save"></md-textarea>
            </md-input-container>
          </md-layout>
          <md-layout md-column md-flex="45" md-flex-offset="10">
            <md-card>
              <md-list>
                <md-list-item>
                  <md-icon>insert_drive_file</md-icon> <span>{{dataset.file.name}}</span> <span>{{(dataset.file.size / 1024).toFixed(2)}} ko</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>update</md-icon>
                  <user-name :user="users[dataset.updatedBy]"></user-name> <span>{{dataset.updatedAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
                <md-list-item>
                  <md-icon>add_circle_outline</md-icon>
                  <user-name :user="users[dataset.createdBy]"></user-name> <span>{{dataset.createdAt | moment("DD/MM/YYYY, HH:mm")}}</span>
                </md-list-item>
              </md-list>
            </md-card>
          </md-layout>
        </md-layout>

        <schema :dataset="dataset" @schema-updated="dataset.schema = $event; dataset.status = 'schematized';save()"></schema>
      </md-tab>

      <md-tab md-label="Vue tableau" md-icon="view_list" :md-active="activeTab === '1'">
        <tabular-view :dataset="dataset"></tabular-view>
      </md-tab>

      <md-tab md-label="Permissions" md-icon="security" :md-active="activeTab === '2'">
        <permissions :resource="dataset" :resource-url="resourceUrl" :api="api"></permissions>
      </md-tab>

      <md-tab md-label="Enrichissement" md-icon="merge_type" :md-active="activeTab === '3'">
        <enrich-dataset :dataset="dataset"></enrich-dataset>
      </md-tab>

      <md-tab md-label="Journal" md-icon="event_note" :md-active="activeTab === '4'">
        <journal :dataset="dataset"></journal>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" :md-active="activeTab === '5'">
        <open-api v-if="api" :api="api"></open-api>
      </md-tab>
    </md-tabs>
  </md-layout>

  <md-layout md-column md-flex-offset="5" class="action">
    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression du jeu de données</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer le jeux de données <code>{{dataset.title}}</code> ? La suppression est définitive et les données ne pourront pas être récupérées.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>

    <md-layout md-flex="30"></md-layout>

    <md-layout md-flex="10">
      <a :href="downloadLink">
        <md-button class="md-icon-button md-raised md-primary">
          <md-icon>file_download</md-icon>
          <md-tooltip md-direction="left">Télécharger les données brutes</md-tooltip>
        </md-button>
      </a>
    </md-layout>
    <md-layout md-flex="10">
      <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
        <md-icon>delete</md-icon>
        <md-tooltip md-direction="left">Supprimer ce jeu de données</md-tooltip>
      </md-button>
    </md-layout>
  </md-layout>
</md-layout>
</template>

<script>
import Permissions from '../components/Permissions.vue'
import Journal from '../components/Journal.vue'
import Schema from '../components/Schema.vue'
import TabularView from '../components/TabularView.vue'
import EnrichDataset from '../components/EnrichDataset.vue'
import UserName from '../components/UserName.vue'
import OpenApi from 'vue-openapi'

const {
  mapState
} = require('vuex')

export default {
  name: 'dataset',
  components: {
    Permissions,
    Journal,
    Schema,
    TabularView,
    EnrichDataset,
    UserName,
    OpenApi
  },
  data: () => ({
    dataset: null,
    users: {},
    activeTab: null,
    api: null
  }),
  computed: {
    downloadLink() {
      if (this.dataset) return this.resourceUrl + '/raw/' + this.dataset.file.name
    },
    resourceUrl(){
      return window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId
    }
  },
  mounted() {
    this.activeTab = this.$route.query.tab || '0'
    this.$http.get(this.resourceUrl).then(result => {
      this.dataset = result.data
      this.$http.get(window.CONFIG.directoryUrl + '/api/users?ids=' + this.dataset.createdBy + ',' + this.dataset.createdBy).then(results => {
        this.users = Object.assign({}, ...results.data.results.map(user => ({
          [user.id]: user
        })))
      })
      this.$http.get(this.resourceUrl + '/api-docs.json').then(response => {
        this.api = response.body
      })
    })
  },
  methods: {
    save() {
      this.$http.put(this.resourceUrl, this.dataset).then(result => {
        this.$store.dispatch('notify', `Le jeu de données a bien été mis à jour`)
        this.dataset = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour du jeu de données`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(this.resourceUrl).then(result => {
        this.$store.dispatch('notify', `Le jeu de données ${this.dataset.title} a bien été supprimé`)
        this.$router.push({name: 'Datasets'})
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression du jeu de données ${this.dataset.title}`)
      })
    }
  }
}
</script>

<style>
.dataset .action{
  height: calc(100vh - 64px);
}
</style>
