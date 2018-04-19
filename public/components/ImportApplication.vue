<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step step="1" :complete="!!description" editable>Selection de l'application</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="2" :complete="currentStep > 2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableApplications"
          item-value="href"
          item-text="title"
          v-model="applicationUrl"
          label="Choisissez une application à configurer"
          @input="downloadFromUrl"
        />
        <v-text-field
          label="Ou saisissez une URL"
          v-model="applicationUrl"
          @blur="downloadFromUrl"
          @keyup.native.enter="downloadFromUrl"
        />
        <p v-if="description" v-html="description.description"/>
        <v-btn color="primary" :disabled="!description" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <v-radio-group v-model="owner" class="mt-3 mb-3">
          <v-radio :label="key === 'user' ? 'Vous-même' : user.organizations.find(o => o.id === owners[key].id).name" :value="key" v-for="key in Object.keys(owners)" :key="key"/>
        </v-radio-group>
        <v-btn color="primary" :disabled="!owner" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="3">
        <v-progress-linear v-model="uploadProgress"/>
        <v-btn color="primary" @click.native="createApplication()">Enregistrer la configuration</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import {mapState} from 'vuex'
import eventBus from '../event-bus'
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()

export default {
  props: ['initApp'],
  data: () => ({
    currentStep: null,
    owner: 'user',
    uploadProgress: 0,
    description: null,
    applicationUrl: null,
    configurableApplications: []
  }),
  computed: {
    ...mapState(['user', 'env']),
    owners() {
      return {
        user: {type: 'user', id: this.user.id, name: this.user.name},
        ...this.user.organizations.reduce((a, o) => {
          a['orga' + o.id] = {type: 'organization', id: o.id, name: o.name}
          return a
        }, {})
      }
    }
  },
  async mounted() {
    this.configurableApplications = await this.$axios.$get('api/v1/configurable-applications')
    if (this.initApp) {
      this.applicationUrl = this.initApp
      this.downloadFromUrl()
    }
  },
  methods: {
    async downloadFromUrl() {
      if (!this.applicationUrl) return
      this.description = null
      try {
        const html = await this.$axios.$get(this.applicationUrl)
        const data = await new Promise((resolve, reject) => {
          htmlExtractor.extract(html, (err, data) => {
            if (err) reject(err)
            else resolve(data)
          })
        })
        this.description = {
          title: data.meta.title,
          description: data.meta.description,
          applicationName: data.meta['application-name']
        }
      } catch (error) {
        eventBus.$emit('notification', {type: 'error', msg: `Erreur ${error.status || error.message || error} pendant la récupération de la description de l'application`})
      }
    },
    async createApplication() {
      const options = {}
      if (this.owners[this.owner].type === 'organization') {
        options.headers = {'x-organizationId': this.owners[this.owner].id}
      }
      try {
        const application = await this.$axios.$post(this.env.publicUrl + '/api/v1/applications', {...this.description, url: this.applicationUrl}, options)
        this.$router.push({path: `/application/${application.id}/description`})
      } catch (error) {
        eventBus.$emit('notification', {type: 'error', msg: `Erreur ${error.status || error.message} pendant la création de la configuration d'application`})
      }
    }
  }
}
</script>
