<template>
  <div>
    <md-toolbar class="md-dense md-primary">
      <h2 class="md-title" style="flex: 1">Importer un service distant</h2>
    </md-toolbar>
    <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="importApi">
      <md-step :md-editable="true" :md-label="currentStep ? 'Fichier sélectionné' : 'Sélection du service'" :md-continue="apiDoc !== null" :md-message="apiDoc ? apiDoc.info.title : 'Choisissez dans la liste'" :md-button-back="null" md-button-continue="Suivant">
        <md-input-container>
          <label>Choisissez un service distant à configurer</label>
          <md-select v-model="apiDocUrl" @change="downloadFromUrl">
            <md-option :value="remoteService.href" v-for="remoteService in configurableRemoteServices" :key="remoteService.id">
              {{ remoteService.title }}
            </md-option>
          </md-select>
        </md-input-container>
        <p v-if="apiDocUrl">{{ configurableRemoteServices.find(a => a.href === apiDocUrl).description }}</p>
      </md-step>
      <md-step :md-editable="true" :md-disabled="!apiDoc" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="apiDoc !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations.find(o => o.id === owners[owner].id).name): 'Choisissez dans la liste'"
               md-button-back="Précédent" md-button-continue="Lancer l'import">
        <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)" :key="key">{{ key === 'user' ? 'Vous-même' : userOrganizations.find(o => o.id === owners[key].id).name }}</md-radio>
      </md-step>
    </md-stepper>
  </div>
</template>

<script>
const {mapState} = require('vuex')
const routerMixin = require('../mixins.js').routerMixin

export default {
  name: 'ImportRemoteService',
  mixins: [routerMixin],
  data: () => ({
    currentStep: null,
    owner: null,
    userOrganizations: [],
    uploading: false,
    uploadProgress: 0,
    apiDoc: null,
    apiDocUrl: null,
    configurableRemoteServices: []
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
  },
  mounted() {
    if (this.user) {
      this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?is-member=true').then(response => {
        this.userOrganizations = response.data.results
      })
    }
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/configurable-remote-services').then(response => {
      this.configurableRemoteServices = response.data
    })
  },
  methods: {
    downloadFromUrl() {
      this.$http.get(this.apiDocUrl).then(response => {
        this.checkApi(response.data)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la récupération du fichier`)
      })
    },
    reset() {
      this.currentStep = null
      this.owner = null
      this.uploading = false
      this.uploadProgress = 0
    },
    checkApi(api) {
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/_check-api', api).then(result => {
        this.apiDoc = api
        this.$store.dispatch('notify', `Le format de la description de l'API est correct`)
      }, error => {
        this.$store.dispatch('notifyError', `Le format de la description de l'API est incorrect`, error)
        this.reset()
      })
    },
    importApi() {
      const options = {
        progress: (e) => {
          if (e.lengthComputable) this.uploadProgress = (e.loaded / e.total) * 100
        }
      }
      this.uploading = true
      if (this.owners[this.owner].type === 'organization') {
        options.headers = {'x-organizationId': this.owners[this.owner].id}
      }
      const securities = this.apiDoc.security.map(s => Object.keys(s).pop()).map(s => this.apiDoc.components.securitySchemes[s])
      const apiKeySecurity = securities.find(s => s.type === 'apiKey')
      if (!apiKeySecurity) return this.$store.dispatch('notifyError', `Erreur, l'API importée n'a pas de schéma de sécurité adapté`)

      this.$http.post(window.CONFIG.publicUrl + '/api/v1/remote-services', {
        apiDoc: this.apiDoc,
        apiKey: {in: apiKeySecurity.in, name: apiKeySecurity.name},
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
        this.$store.dispatch('notify', `La description du service distant a bien été importée. <a href="${link}">Accéder à la configuration du service</a>`)
        this.$emit('success')
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant l'import du fichier`)
        this.reset()
      })
    }
  }
}
</script>
