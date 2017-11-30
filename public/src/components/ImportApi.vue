<template>
<div>
  <h3 class="md-display-1">Importer une API</h3>
  <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="importApi">
    <md-step :md-editable="true" :md-label="currentStep ? 'Fichier sélectionné' : 'Sélection du fichier'" :md-continue="file !== null" :md-message="fileName ? fileName: 'Chargez un fichier json'" :md-button-back="null" md-button-continue="Suivant">
      <md-input-container>
        <label>Single</label>
        <md-file v-model="fileName" @selected="onFileUpload" accept="application/json"></md-file>
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
const routerMixin = require('../mixins.js').routerMixin

export default {
  name: 'import-api',
  mixins: [routerMixin],
  data: () => ({
    fileName: null,
    file: null,
    currentStep: null,
    owner: null,
    userOrganizations: [],
    actions: {},
    action: null,
    uploading: false,
    uploadProgress: 0,
    apiDoc: null
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
      const reader = new FileReader()
      reader.onload = (event) => {
        // The file's text will be printed here
        this.apiDoc = JSON.parse(event.target.result)
      }
      reader.readAsText(this.file)
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
    importApi() {
      const options = {
        progress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      this.uploading = true
      if (this.actions[this.action].type === 'create') {
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/external-apis', {
          owner: this.owners[this.owner],
          apiDoc: this.apiDoc
        }, options).then(results => {
          this.$emit('external-api-change')
          this.reset()
          const link = this.urlFromRoute({name:'ExternalApi', params:{externalApiId: results.body.id}})
          this.$store.dispatch('notify', `La description de l'API a bien été importée. <a href="${link}">Accéder à la description</a>`)
        }, error => {
          this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
        })
      } else {
        formData.append('file', this.file)
        this.$http.post(window.CONFIG.publicUrl + '/api/v1/external-apis/' + this.actions[this.action].id, formData, options).then(results => {
          this.reset()
          const link = this.urlFromRoute({name:'Dataset', params:{datasetId: results.body.id}})
          this.$store.dispatch('notify', `La description de l'API a bien été mise à jour. <a href="${link}">Accéder à la description</a>`)
        }, error => {
          this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
        })
      }
    }
  },
  watch: {
    currentStep() {
      if (this.currentStep === 2) {
        this.$http.get(window.CONFIG.publicUrl + '/api/v1/external-apis', {
          params: {
            'owner-type': this.owners[this.owner].type,
            'owner-id': this.owners[this.owner].id
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
