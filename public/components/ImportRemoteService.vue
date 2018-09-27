<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="!!apiDoc" step="1" editable>Sélection du service</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 2" step="2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableRemoteServices"
          v-model="apiDocUrl"
          item-value="href"
          item-text="title"
          label="Choisissez un service à configurer"
          @input="downloadFromUrl"
        />
        <v-text-field
          v-model="apiDocUrl"
          label="Ou saisissez une URL de documentation"
          @blur="downloadFromUrl"
          @keyup.native.enter="downloadFromUrl"
        />
        <p v-if="apiDoc" v-html="marked(apiDoc.info.description)"/>
        <v-btn :disabled="!apiDoc" color="primary" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <owner-pick v-model="owner"/>
        <v-btn :disabled="!owner" color="primary" @click.native="currentStep = 3">Continuer</v-btn>
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
import { mapState } from 'vuex'
import eventBus from '../event-bus'
import OwnerPick from './OwnerPick.vue'

export default {
  components: { OwnerPick },
  props: ['initService'],
  data: () => ({
    currentStep: null,
    owner: null,
    uploadProgress: 0,
    apiDoc: null,
    apiDocUrl: null,
    configurableRemoteServices: [],
    marked
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  async mounted() {
    this.configurableRemoteServices = await this.$axios.$get('api/v1/configurable-remote-services')
    if (this.initService) {
      this.apiDocUrl = this.initService
      this.downloadFromUrl()
    }
  },
  methods: {
    async downloadFromUrl() {
      this.apiDoc = null
      if (!this.apiDocUrl) return
      try {
        const api = await this.$axios.$get(this.apiDocUrl)
        this.checkApi(api)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération du fichier` })
      }
    },
    async checkApi(api) {
      try {
        await this.$axios.$post('api/v1/_check-api', api)
        this.apiDoc = api
      } catch (error) {
        eventBus.$emit('notification', { type: 'error', msg: `Le format de la description de l'API est incorrect` })
      }
    },
    async importApi() {
      const options = {
        headers: { 'x-organizationId': 'user' },
        progress: (e) => {
          if (e.lengthComputable) this.uploadProgress = (e.loaded / e.total) * 100
        }
      }
      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      const securities = (this.apiDoc.security || []).map(s => Object.keys(s).pop()).map(s => this.apiDoc.components.securitySchemes[s])
      const apiKeySecurity = securities.find(s => s.type === 'apiKey')
      if (!apiKeySecurity) return eventBus.$emit('notification', { type: 'error', msg: `Erreur, l'API importée n'a pas de schéma de sécurité adapté` })

      try {
        const remoteService = await this.$axios.$post(this.env.publicUrl + '/api/v1/remote-services', {
          apiDoc: this.apiDoc,
          apiKey: { in: apiKeySecurity.in, name: apiKeySecurity.name },
          url: this.apiDocUrl,
          server: this.apiDoc.servers && this.apiDoc.servers.length && this.apiDoc.servers[0].url
        }, options)
        this.$router.push({ path: `/remote-service/${remoteService.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant l'import de la description du service` })
      }
    }
  }
}
</script>
