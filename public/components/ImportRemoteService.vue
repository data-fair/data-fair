<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step step="1" :complete="!!apiDoc" editable>Sélection du service</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="2" :complete="currentStep > 2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableRemoteServices"
          item-value="href"
          item-text="title"
          v-model="apiDocUrl"
          label="Choisissez un service distant à configurer"
          @input="downloadFromUrl"
        />
        <v-text-field
          label="Ou saisissez une URL de documentation"
          v-model="apiDocUrl"
          @blur="downloadFromUrl"
          @keyup.native.enter="downloadFromUrl"
        />
        <p v-if="apiDoc" v-html="marked(apiDoc.info.description)"/>
        <v-btn color="primary" :disabled="!apiDoc" @click.native="currentStep = 2">Continuer</v-btn>
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
        <v-btn color="primary" @click.native="importApi()">Lancer l'import</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import marked from 'marked'
import {mapState} from 'vuex'
import eventBus from '../event-bus'

export default {
  data: () => ({
    currentStep: null,
    owner: 'user',
    uploadProgress: 0,
    apiDoc: null,
    apiDocUrl: null,
    configurableRemoteServices: [],
    marked
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
    this.configurableRemoteServices = await this.$axios.$get('api/v1/configurable-remote-services')
  },
  methods: {
    async downloadFromUrl() {
      this.apiDoc = null
      if (!this.apiDocUrl) return
      try {
        const api = await this.$axios.$get(this.apiDocUrl)
        this.checkApi(api)
      } catch (error) {
        eventBus.$emit('notification', {type: 'error', msg: `Erreur ${error.status || error.message} pendant la récupération du fichier`})
      }
    },
    async checkApi(api) {
      try {
        await this.$axios.$post('api/v1/_check-api', api)
        this.apiDoc = api
      } catch (error) {
        eventBus.$emit('notification', {type: 'error', msg: `Le format de la description de l'API est incorrect`})
      }
    },
    async importApi() {
      const options = {
        progress: (e) => {
          if (e.lengthComputable) this.uploadProgress = (e.loaded / e.total) * 100
        }
      }
      if (this.owners[this.owner].type === 'organization') {
        options.headers = {'x-organizationId': this.owners[this.owner].id}
      }
      const securities = (this.apiDoc.security || []).map(s => Object.keys(s).pop()).map(s => this.apiDoc.components.securitySchemes[s])
      const apiKeySecurity = securities.find(s => s.type === 'apiKey')
      if (!apiKeySecurity) return this.$store.dispatch('notifyError', `Erreur, l'API importée n'a pas de schéma de sécurité adapté`)

      try {
        const remoteService = await this.$axios.$post(this.env.publicUrl + '/api/v1/remote-services', {
          apiDoc: this.apiDoc,
          apiKey: {in: apiKeySecurity.in, name: apiKeySecurity.name},
          url: this.apiDocUrl,
          server: this.apiDoc.servers && this.apiDoc.servers.length && this.apiDoc.servers[0].url
        }, options)
        this.$router.push({path: `/remote-service/${remoteService.id}/description`})
      } catch (error) {
        this.$store.dispatch('notifyError', `Erreur ${error.status || error.message} pendant l'import de la description du service`)
      }
    }
  }
}
</script>
