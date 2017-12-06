<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="applicationConfig">
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

    <h3 class="md-headline">Actions</h3>
    <md-dialog md-open-from="#delete" md-close-to="#delete" ref="delete-dialog">
      <md-dialog-title>Suppression du jeu de données</md-dialog-title>

      <md-dialog-content>Voulez vous vraiment supprimer la configuration de l'application <code>{{applicationConfig.title}}</code> ? La suppression est définitive et le paramétrage sera perdu.</md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-default md-raised" @click="$refs['delete-dialog'].close()">Non</md-button>
        <md-button class="md-warn md-raised" @click="remove">Oui</md-button>
      </md-dialog-actions>
    </md-dialog>

    <md-layout md-align="center">
      <a :href="applicationLink" target="_blank">
        <md-button class="md-icon-button md-raised md-primary">
          <md-icon>description</md-icon>
          <md-tooltip md-direction="top">Accéder à l'application</md-tooltip>
        </md-button>
      </a>
      <md-button class="md-icon-button md-raised md-warn" id="delete" @click="$refs['delete-dialog'].open()">
        <md-icon>delete</md-icon>
      </md-button>
    </md-layout>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'application-config',
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
