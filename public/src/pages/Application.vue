<template>
<md-layout md-align="center" class="application" v-if="application">
  <md-layout md-column md-flex="85" md-flex-offset="5">
    <md-tabs md-fixed class="md-transparent" @change="$router.push({query:{tab:$event}})">
      <md-tab md-label="Description" md-icon="toc" :md-active="activeTab === '0'">
        <h3 class="md-headline">Informations</h3>
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="application.title" @blur="save"></md-input>
        </md-input-container>
        <md-input-container>
          <label>Description</label>
          <md-textarea v-model="application.description" @blur="save"></md-textarea>
        </md-input-container>
        <md-input-container>
          <label>Adresse</label>
          <md-input v-model="application.url" @blur="save"></md-input>
        </md-input-container>
      </md-tab>

      <md-tab md-label="Permissions" md-icon="security" :md-active="activeTab === '1'">
        <permissions :resource="application" :api="api" @permissions-updated="save"></permissions>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" :md-active="activeTab === '2'">
        <open-api v-if="api" :api="api"></open-api>
      </md-tab>
    </md-tabs>
  </md-layout>

  <md-layout md-column md-flex-offset="5" class="action">
    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression de la configuration d'application</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer la configuration de l'application <code>{{application.title}}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>

    <md-layout md-flex="30"></md-layout>

    <md-layout md-flex="10">
      <a :href="applicationLink" target="_blank">
        <md-button class="md-icon-button md-raised md-primary">
          <md-icon>description</md-icon>
          <md-tooltip md-direction="left">Accéder à l'application</md-tooltip>
        </md-button>
      </a>
    </md-layout>
    <md-layout md-flex="10">
      <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
        <md-icon>delete</md-icon>
        <md-tooltip md-direction="left">Supprimer cette configuration d'application</md-tooltip>
      </md-button>
    </md-layout>
  </md-layout>

</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
import Permissions from '../components/Permissions.vue'
import OpenApi from 'vue-openapi'

export default {
  name: 'application',
  components: {
    Permissions,
    OpenApi
  },
  data: () => ({
    application: null,
    activeTab: null,
    api: null
  }),
  mounted() {
    this.activeTab = this.$route.query.tab || '0'
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/applications/' + this.$route.params.applicationId).then(result => {
      this.application = result.data
      this.$http.get(`${window.CONFIG.publicUrl}/api/v1/applications/${this.application.id}/api-docs.json`).then(response => {
        this.api = response.body
      })
    })
  },
  computed:{
    applicationLink() {
      if (this.application) return window.CONFIG.publicUrl + '/app/' + this.application.id
    }
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/applications/' + this.$route.params.applicationId, this.application).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application a bien été mise à jour`)
        this.application = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la configuration de l'application`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(window.CONFIG.publicUrl + '/api/v1/applications/' + this.$route.params.applicationId).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application ${this.application.title} a bien été supprimée`)
        this.$router.push({
          name: 'Home'
        })
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression de la configuration de l'application ${this.application.title}`)
      })
    }
  }
}
</script>

<style>
.application .action{
  height: calc(100vh - 64px);
}
</style>
