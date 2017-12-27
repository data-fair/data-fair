<template>
<div>
  <h3 class="md-display-1">Configuration une application</h3>
  <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="createApplicationConfig">
    <md-step :md-editable="true" :md-label="currentStep ? 'Adresse de l\'application' : 'Aucune adresse'" :md-continue="description !== null" :md-message="description ? description.url: 'Entrez une adresse'" :md-button-back="null" md-button-continue="Suivant">
      <md-layout md-row>
        <md-layout md-flex="85">
          <md-input-container>
            <label>URL de l'application'</label>
            <md-input v-model="applicationUrl"></md-input>
          </md-input-container>
        </md-layout>
        <md-layout>
          <md-button class="md-icon-button md-raised md-primary" @click="downloadFromUrl" :disabled="!applicationUrl">
            <md-icon>file_download</md-icon>
          </md-button>
        </md-layout>
      </md-layout>
    </md-step>
    <md-step :md-editable="true" :md-disabled="!description" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="description !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations.find(o => o.id === owners[owner].id).name): 'Choisissez dans la liste'"
      md-button-back="Précédent" md-button-continue="Suivant">
      <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)">{{key === 'user' ? 'Vous-même' : userOrganizations.find(o => o.id === owners[key].id).name}}</md-radio>
    </md-step>
  </md-stepper>
</div>
</template>

<script>
const {
  mapState
} = require('vuex')
const routerMixin = require('../mixins.js').routerMixin
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()

export default {
  name: 'configure-application',
  mixins: [routerMixin],
  data: () => ({
    currentStep: null,
    owner: null,
    userOrganizations: [],
    uploading: false,
    description: null,
    applicationUrl: 'https://staging.koumoul.com/s/infos-parcelles/'
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
    downloadFromUrl() {
      this.$http.get(this.applicationUrl).then(response => {
        htmlExtractor.extract(response.data, (err, data) => {
          if (err) {
            this.$store.dispatch('notifyError', `Erreur pendant la récupération de la description de l'application : ${error} `)
          } else {
            this.description = {
              title: data.meta.title,
              description: data.meta.description
            }
          }
        })
        // this.checkApi(response.data)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la récupération de la description de l'application`)
      })
    },
    reset() {
      this.currentStep = null
      this.owner = null
      this.description = null
      this.uploading = false
    },
    createApplicationConfig() {
      this.uploading = true
      const options = {}
      if(this.owners[this.owner].type === 'organization'){
        options.headers = {
          'x-organizationId' : this.owners[this.owner].id
        }
      }
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/application-configs', Object.assign({
        url: this.applicationUrl
      }, this.description), options).then(results => {
        this.$emit('application-config-created')
        this.reset()
        const link = this.urlFromRoute({
          name: 'ApplicationConfig',
          params: {
            applicationConfigId: results.body.id
          }
        })
        this.$store.dispatch('notify', `Une configuration spécifique pour l'application a bien été créée. <a href="${link}">Accéder à l'application'</a>`)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la création de la configuration d'application`)
      })
    }
  }
}
</script>
