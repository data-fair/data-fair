<template>
  <div>
    <md-toolbar class="md-dense md-primary">
      <h2 class="md-title" style="flex: 1">Configurer une application</h2>
    </md-toolbar>
    <md-stepper :md-alternate-labels="true" @change="currentStep = $event" @completed="createApplication">
      <md-step :md-editable="true" :md-label="currentStep ? 'Application sélectionnée' : 'Selection de l\'application'" :md-continue="description !== null" :md-message="description ? description.title: 'Choisissez dans la liste'" :md-button-back="null" md-button-continue="Suivant">
        <md-layout md-row>
          <md-input-container>
            <label>Choisissez une application à configurer</label>
            <md-select v-model="applicationUrl" @change="downloadFromUrl">
              <md-option :value="application.href" v-for="application in configurableApplications" :key="application.id">
                {{ application.title }}
              </md-option>
            </md-select>
          </md-input-container>
          <p v-if="applicationUrl">{{ configurableApplications.find(a => a.href === applicationUrl).description }}</p>
        </md-layout>
      </md-step>
      <md-step :md-editable="true" :md-disabled="!description" :md-label="currentStep > 1 ? 'Propriétaire choisi' : 'Choix du propriétaire'" :md-continue="description !== null && owner !== null" :md-message="owner ? (owners[owner].type === 'user' ? 'Vous même' : userOrganizations.find(o => o.id === owners[owner].id).name): 'Choisissez dans la liste'"
               md-button-back="Précédent" md-button-continue="Enregistrer la configuration">
        <md-radio v-model="owner" :md-value="key" v-for="key in Object.keys(owners)" :key="key">{{ key === 'user' ? 'Vous-même' : userOrganizations.find(o => o.id === owners[key].id).name }}</md-radio>
      </md-step>
    </md-stepper>
  </div>
</template>

<script>
const {mapState} = require('vuex')
const routerMixin = require('../mixins.js').routerMixin
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()

export default {
  name: 'ConfigureApplication',
  mixins: [routerMixin],
  data: () => ({
    currentStep: null,
    owner: null,
    userOrganizations: [],
    uploading: false,
    description: null,
    applicationUrl: null,
    configurableApplications: []
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
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/configurable-applications').then(response => {
      this.configurableApplications = response.data
    })
  },
  methods: {
    downloadFromUrl() {
      if (!this.applicationUrl) return
      this.$http.get(this.applicationUrl).then(response => {
        htmlExtractor.extract(response.data, (err, data) => {
          if (err) {
            this.$store.dispatch('notifyError', `Erreur pendant la récupération de la description de l'application : ${err} `)
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
    createApplication() {
      this.uploading = true
      const options = {}
      if (this.owners[this.owner].type === 'organization') {
        options.headers = {'x-organizationId': this.owners[this.owner].id}
      }
      this.$http.post(window.CONFIG.publicUrl + '/api/v1/applications', Object.assign({
        url: this.applicationUrl
      }, this.description), options).then(results => {
        this.$emit('application-created')
        this.reset()
        const link = this.urlFromRoute({
          name: 'Application',
          params: {
            applicationId: results.body.id
          }
        })
        this.$store.dispatch('notify', `Une configuration spécifique pour l'application a bien été créée. <a href="${link}">Accéder à l'application</a>`)
        this.$emit('success')
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la création de la configuration d'application`)
      })
    }
  }
}
</script>
