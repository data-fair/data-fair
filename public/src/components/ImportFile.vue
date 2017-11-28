<template>
<div>
  <h3 class="md-display-1">Importer un fichier</h3>
  <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="importData">
    <md-step :md-editable="true" :md-label="currentStep ? 'Fichier sélectionné' : 'Sélection du fichier'" :md-continue="file !== null" :md-message="fileName ? fileName: 'Chargez un fichier csv'" :md-button-back="null" md-button-continue="Suivant">
      <md-input-container>
        <label>Single</label>
        <md-file v-model="fileName" @selected="onFileUpload" accept="text/csv"></md-file>
      </md-input-container>
    </md-step>
    <md-step :md-editable="true" :md-disabled="!file" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="file !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations.find(o => o.id === owners[owner].id).name): 'Choisissez dans la liste'"
      md-button-back="Précédent" md-button-continue="Suivant">
      <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)">{{key === 'user' ? 'Vous-même' : userOrganizations.find(o => o.id === owners[key].id).name}}</md-radio>
    </md-step>
    <md-step :md-disabled="!file || !owner" md-label="Action à effectuer" :md-continue="file !== null && owner !== null && action !== null && !uploading" :md-message="action ? actions[action].title : 'Choisissez dans la liste'" md-button-back="Précédent"
      md-button-continue="Lancer l'import">
      <md-radio v-model="action" :md-value="key" v-for="key in Object.keys(actions)">{{actions[key].title}}</md-radio>
      <md-progress :md-progress="uploadProgress" v-if="uploading"></md-progress>
    </md-step>
  </md-stepper>
</div>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'import-file',
  data: () => ({
    fileName: null,
    file: null,
    currentStep: null,
    owner: null,
    userOrganizations: [],
    actions: {},
    action: null,
    uploading: false,
    uploadProgress: 0
  }),
  computed: {
    ...mapState({
      user: state => state.user
    }),
    owners() {
      return (this.user && Object.assign({
        user: {
          type: 'user',
          id: this.user.id
        }
      }, ...this.userOrganizations.map(o => ({
        ['orga' + o.id]: {
          type: 'organization',
          id: o.id
        }
      })))) || {}
    }
  },
  mounted() {
    if (this.user) {
      this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?is-member=true').then(response => {
        this.userOrganizations = response.data.results
      })
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
        formData.append('owner[type]', this.owners[this.owner].type)
        formData.append('owner[id]', this.owners[this.owner].id)
        formData.append('file', this.file)
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/datasets', formData, options).then(results => {
          this.$emit('datasets-change')
          this.reset()
        })
      } else {
        formData.append('file', this.file)
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.actions[this.action].id, formData, options).then(results => {
          this.reset()
        })
      }

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
  }
}
</script>
