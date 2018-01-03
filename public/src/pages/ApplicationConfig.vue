<template>
<md-layout md-align="center" class="application-config" v-if="applicationConfig">
  <md-layout md-column md-flex="85" md-flex-offset="5">
    <md-tabs md-fixed class="md-transparent">
      <md-tab md-label="Description" md-icon="toc">
        <h3 class="md-headline">Informations</h3>
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="applicationConfig.title" @blur="save"></md-input>
        </md-input-container>
        <md-input-container>
          <label>Description</label>
          <md-textarea v-model="applicationConfig.description" @blur="save"></md-textarea>
        </md-input-container>
        <md-input-container>
          <label>Adresse</label>
          <md-input v-model="applicationConfig.url" @blur="save"></md-input>
        </md-input-container>
      </md-tab>

      <md-tab md-label="Permissions" md-icon="security">
        <!-- <permissions :resource="applicationConfig" :api="externalApi.apiDoc" @permissions-updated="save"></permissions> -->
      </md-tab>
    </md-tabs>
  </md-layout>

  <md-layout md-column md-flex-offset="5" class="action">
    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression du jeu de données</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer la configuration de l'application <code>{{applicationConfig.title}}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

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

export default {
  name: 'application-config',
  components: {
    Permissions
  },
  data: () => ({
    applicationConfig: null
  }),
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/application-configs/' + this.$route.params.applicationConfigId).then(result => {
      this.applicationConfig = result.data
    })
  },
  computed:{
    applicationLink() {
      if (this.applicationConfig) return window.CONFIG.publicUrl + '/applications/' + this.applicationConfig.id
    }
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/application-configs/' + this.$route.params.applicationConfigId, this.applicationConfig).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application a bien été mise à jour`)
        this.applicationConfig = result.data
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour de la configuration de l'application`)
      })
    },
    remove() {
      this.$refs['delete-dialog'].close()
      this.$http.delete(window.CONFIG.publicUrl + '/api/v1/application-configs/' + this.$route.params.applicationConfigId).then(result => {
        this.$store.dispatch('notify', `La configuration de l'application ${this.applicationConfig.title} a bien été supprimée`)
        this.$router.push({
          name: 'Home'
        })
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la suppression de la configuration de l'application ${this.applicationConfig.title}`)
      })
    }
  }
}
</script>

<style>
.application-config .action{
  height: calc(100vh - 64px);
}
</style>
