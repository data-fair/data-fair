<template>
<div>
  <h3 class="md-display-1">Importer un service distant</h3>
  <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="importApi">
    <md-step :md-editable="true" :md-label="currentStep ? 'Fichier sélectionné' : 'Sélection du fichier'" :md-continue="apiDoc !== null" :md-message="fileName ? fileName: 'Chargez un fichier json'" :md-button-back="null" md-button-continue="Suivant">
      <md-input-container>
        <label>Fichier JSON</label>
        <md-file v-model="fileName" @selected="onFileUpload" accept="application/json"></md-file>
      </md-input-container>
      <md-layout md-row>
        <md-layout md-flex="85">
          <md-input-container>
            <label>URL de la description</label>
            <md-input v-model="apiDocUrl"></md-input>
          </md-input-container>
        </md-layout>
        <md-layout>
          <md-button class="md-icon-button md-raised md-primary" @click="downloadFromUrl" :disabled="!apiDocUrl">
            <md-icon>file_download</md-icon>
          </md-button>
        </md-layout>
      </md-layout>
    </md-step>
    <md-step :md-editable="true" :md-disabled="!apiDoc" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="apiDoc !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations.find(o => o.id === owners[owner].id).name): 'Choisissez dans la liste'"
      md-button-back="Précédent" md-button-continue="Suivant">
      <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)">{{key === 'user' ? 'Vous-même' : userOrganizations.find(o => o.id === owners[key].id).name}}</md-radio>
    </md-step>
    <md-step :md-disabled="!apiDoc || !owner" md-label="Action à effectuer" :md-continue="apiDoc !== null && owner !== null && action !== null && !uploading" :md-message="action ? actions[action].title : 'Choisissez dans la liste'" md-button-back="Précédent"
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
  name: 'import-remote-service',
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
    apiDoc: null,
    apiDocUrl: 'https://staging.koumoul.com/s/geocoder/api/v1/api-docs.json'
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
        const api = JSON.parse(event.target.result)
        this.checkApi(api)
      }
      reader.readAsText(this.file)
    },
    downloadFromUrl(){
      this.$http.get(this.apiDocUrl).then(response => {
        this.checkApi(response.data)
      }, error =>{
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la récupération du fichier`)
      })
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
    checkApi(api){
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/_check-api', api).then(result => {
        this.apiDoc = api
        this.$store.dispatch('notify', `Le format de la description de l'API est correct`)
      }, error => {
        this.$store.dispatch('notifyError', `Le format de la description de l'API est incorrect`)
        this.reset()
      })
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
        if(this.owners[this.owner].type === 'organization'){
          options.headers = {
            'x-organizationId' : this.owners[this.owner].id
          }
        }
        const securities = this.apiDoc.security.map(s => Object.keys(s).pop()).map(s => this.apiDoc.components.securitySchemes[s])
        const apiKeySecurity = securities.find(s => s.type === 'apiKey')
        if(apiKeySecurity){
          this.$http.post(window.CONFIG.publicUrl + '/api/v1/remote-services', {
            apiDoc: this.apiDoc,
            apiKey: {
              in: apiKeySecurity.in,
              name: apiKeySecurity.name
            },
            url: this.apiDocUrl,
            server: this.apiDoc.servers && this.apiDoc.servers.length && this.apiDoc.servers[0].url
          }, options).then(results => {
            this.$emit('remote-service-change')
            this.reset()
            const link = this.urlFromRoute({
              name: 'RemoteService',
              params: {
                remoteServiceId: results.body.id
              }
            })
            this.$store.dispatch('notify', `La description de l'API a bien été importée. <a href="${link}">Accéder à la description</a>`)
          }, error => {
            this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
            this.reset()
          })
        } else {
          this.$store.dispatch('notifyError', `Erreur, l'API importée n'a pas de schéma de sécurité adapté`)
        }
      } else {
        /* TODO: implement patch route ro update apiDoc property by drag & droping json file
        this.$http.patch(window.CONFIG.publicUrl + '/api/v1/remote-services/' + this.actions[this.action].id, {apiDoc: this.apiDoc}, options).then(results => {
          this.reset()
          const link = this.urlFromRoute({
            name: 'RemoteService',
            params: {
              remoteServiceId: results.body.id
            }
          })
          this.$store.dispatch('notify', `La description de l'API a bien été mise à jour. <a href="${link}">Accéder à la description</a>`)
        }, error => {
          this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
          this.reset()
        })
        */
      }
    }
  },
  watch: {
    currentStep() {
      if (this.currentStep === 2) {
        this.$http.get(window.CONFIG.publicUrl + '/api/v1/remote-services', {
          params: {
            'owner-type': this.owners[this.owner].type,
            'owner-id': this.owners[this.owner].id
          }
        }).then(response => {
          this.actions = Object.assign({
            create: {
              type: 'create',
              title: 'Créer une nouvelle réutilisation de l\'API'
            }
          }, ...response.data.results.map(d => ({
            ['update' + d.id]: {
              type: 'update',
              id: d.id,
              title: 'Mettre à jour la description de l\'API ' + d.title
            }
          })))
        })
      }
    }
  }
}
</script>
