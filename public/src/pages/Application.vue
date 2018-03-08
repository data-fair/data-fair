<template>
  <div class="application" v-if="application">
    <md-tabs md-fixed class="md-transparent" ref="tabs" @change="changeTab">
      <md-tab md-label="Description" md-icon="toc" id="description" :md-active="activeTab === 'description'">
        <h3 class="md-headline">Informations</h3>
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="application.title" @blur="save"/>
        </md-input-container>
        <md-input-container>
          <label>Description</label>
          <md-textarea v-model="application.description" @blur="save"/>
        </md-input-container>
        <md-input-container>
          <label>Adresse</label>
          <md-input v-model="application.url" @blur="save"/>
        </md-input-container>
      </md-tab>

      <md-tab md-label="Permissions" md-icon="security" v-if="isOwner" id="permissions" :md-active="activeTab === 'permissions'">
        <permissions :resource="application" :resource-url="resourceUrl" :api="api"/>
      </md-tab>

      <md-tab md-label="API" md-icon="cloud" id="api" :md-active="activeTab === 'api'">
        <open-api v-if="activeTab === 'api' && api" :api="api"/>
      </md-tab>
    </md-tabs>

    <div class="actions-buttons">
      <div style="margin-top: 100px">
        <md-button class="md-icon-button md-raised md-primary" :href="applicationLink" target="_blank">
          <md-icon>exit_to_app</md-icon>
          <md-tooltip md-direction="left">Accéder à l'application</md-tooltip>
        </md-button>
      </div>
      <div>
        <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
          <md-icon>delete</md-icon>
          <md-tooltip md-direction="left">Supprimer cette configuration d'application</md-tooltip>
        </md-button>
      </div>
    </div>

    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression de la configuration d'application</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer la configuration de l'application <code>{{ application.title }}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import {mapState} from 'vuex'
import OpenApi from 'vue-openapi'
import Permissions from '../components/Permissions.vue'

export default {
  name: 'Application',
  components: {
    Permissions,
    OpenApi
  },
  data: () => ({
    application: null,
    activeTab: null,
    api: null
  }),
  computed: {
    ...mapState(['user']),
    applicationLink() {
      if (this.application) return window.CONFIG.publicUrl + '/app/' + this.application.id
    },
    resourceUrl() {
      return window.CONFIG.publicUrl + '/api/v1/applications/' + this.$route.params.applicationId
    },
    isOwner() {
      return this.application.userPermissions.isOwner
    }
  },
  mounted() {
    this.activeTab = this.$route.query.tab || 'description'
    this.$http.get(this.resourceUrl).then(result => {
      this.application = result.data
      this.$http.get(this.resourceUrl + '/api-docs.json').then(response => {
        this.api = response.body
      })
    })
  },
  methods: {
    save() {
      const patch = Object.assign({}, ...['configuration', 'url', 'description', 'title'].map(key => ({ [key]: this.application[key] })))
      this.$http.patch(this.resourceUrl, patch).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application a bien été mise à jour`)
        this.application = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la configuration de l'application`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(this.resourceUrl).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application ${this.application.title} a bien été supprimée`)
        this.$router.push({name: 'Applications'})
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression de la configuration de l'application ${this.application.title}`)
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
.application .action{
  height: calc(100vh - 64px);
}
</style>
