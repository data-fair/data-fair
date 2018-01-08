<template>
  <div>
    <md-toolbar class="md-dense md-primary">
      <h2 class="md-title" style="flex: 1">Importer un fichier</h2>
    </md-toolbar>
    <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="importData">
      <md-step :md-editable="true" :md-label="currentStep ? 'Fichier sélectionné' : 'Sélection du fichier'" :md-continue="file !== null" :md-message="fileName ? fileName: 'Chargez un fichier csv'" :md-button-back="null" md-button-continue="Suivant">
        <md-input-container>
          <label>Fichier CSV</label>
          <md-file v-model="fileName" @selected="onFileUpload" accept="text/csv"/>
        </md-input-container>
      </md-step>
      <md-step :md-editable="true" :md-disabled="!file" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="file !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations[owners[owner].id].name) : 'Choisissez dans la liste'"
               md-button-back="Précédent" md-button-continue="Suivant">
        <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)" :key="key">{{ key === 'user' ? 'Vous-même' : userOrganizations[owners[key].id].name }}</md-radio>
      </md-step>
      <md-step :md-disabled="!file || !owner" md-label="Action à effectuer" :md-continue="file !== null && owner !== null && action !== null && !uploading" :md-message="action ? actions[action].title : 'Choisissez dans la liste'" md-button-back="Précédent"
               md-button-continue="Lancer l'import">
        <md-radio v-model="action" :md-value="key" v-for="key in Object.keys(actions)" :key="key">{{ actions[key].title }}</md-radio>
        <md-progress :md-progress="uploadProgress" v-if="uploading"/>
      </md-step>
    </md-stepper>
  </div>
</template>

<script>
const {mapState} = require('vuex')
const routerMixin = require('../mixins.js').routerMixin

export default {
  name: 'ImportFile',
  mixins: [routerMixin],
  data: () => ({
    fileName: null,
    file: null,
    currentStep: null,
    owner: null,
    actions: {},
    action: null,
    uploading: false,
    uploadProgress: 0
  }),
  computed: {
    ...mapState({
      user: state => state.user,
      userOrganizations: state => state.userOrganizations
    }),
    owners() {
      return (this.user && Object.assign({
        user: {
          type: 'user',
          id: this.user.id
        }
      }, ...Object.keys(this.userOrganizations || {}).map(o => ({
        ['orga' + o]: {
          type: 'organization',
          id: o
        }
      })))) || {}
    }
  },
  watch: {
    currentStep() {
      if (this.currentStep === 2) {
        this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets', {
          params: {
            'owner-type': this.owners[this.owner].type,
            'owner-id': this.owners[this.owner].id,
            'filename': this.fileName
          }
        }).then(response => {
          this.actions = Object.assign({
            create: {
              type: 'create',
              title: 'Créer un nouveau jeu de données'
            }
          }, ...response.data.results.map(d => ({
            ['update' + d.id]: {
              type: 'update',
              id: d.id,
              title: 'Mettre à jour les données du jeu ' + d.title
            }
          })))
        })
      }
    }
  },
  methods: {
    onFileUpload(e) {
      this.file = e[0]
    },
    reset() {
      this.currentStep = null
      this.fileName = null
      this.file = null
      this.owner = null
      this.action = null
      this.uploading = false
      this.uploadProgress = 0
    },
    importData() {
      const options = {
        progress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      const formData = new FormData()
      this.uploading = true
      if (this.actions[this.action].type === 'create') {
        if (this.owners[this.owner].type === 'organization') {
          options.headers = {
            'x-organizationId': this.owners[this.owner].id
          }
        }
        formData.append('file', this.file)
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/datasets', formData, options).then(results => {
          this.$emit('datasets-change')
          this.reset()
          const link = this.urlFromRoute({name: 'Dataset', params: {datasetId: results.body.id}})
          this.$store.dispatch('notify', `Le fichier a bien été importé et le jeu de données a été créé. <a href="${link}">Accéder au jeu de données</a>`)
          this.$emit('success')
        }, error => {
          this.uploading = false
          if (error.status === 413) {
            this.$store.dispatch('notifyError', `Le fichier est trop volumineux pour être importé`)
          } else if (error.status === 429) {
            this.$store.dispatch('notifyError', `L'espace de stockage du propriétaire sélectionné n'a pas assez d'espace disponible pour contenir le fichier`)
          } else {
            this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
          }
        })
      } else {
        formData.append('file', this.file)
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.actions[this.action].id, formData, options).then(results => {
          this.reset()
          const link = this.urlFromRoute({name: 'Dataset', params: {datasetId: results.body.id}})
          this.$store.dispatch('notify', `Le fichier a bien été importé et le jeu de données a été mis à jour. <a href="${link}">Accéder au jeu de données</a>`)
          this.$emit('success')
        }, error => {
          this.uploading = false
          if (error.status === 413) {
            this.$store.dispatch('notifyError', `Le fichier est trop volumineux pour être importé`)
          } else if (error.status === 429) {
            this.$store.dispatch('notifyError', `L'espace de stockage du propriétaire sélectionné n'a pas assez d'espace disponible pour contenir le fichier`)
          } else {
            this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
          }
        })
      }
    }
  }
}
</script>
