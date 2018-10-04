<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="!!description" step="1" editable>Sélection de l'application</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 2" step="2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableApplications"
          v-model="applicationUrl"
          item-value="href"
          item-text="title"
          label="Choisissez une application à configurer"
          @input="downloadFromUrl"
        />
        <v-text-field
          v-model="applicationUrl"
          label="Ou saisissez une URL"
          @blur="downloadFromUrl"
          @keyup.native.enter="downloadFromUrl"
        />
        <v-text-field
          v-if="description"
          v-model="description.title"
          label="Titre"
        />
        <p v-if="description" v-html="description.description"/>
        <v-btn :disabled="!description" color="primary" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <owner-pick v-model="owner"/>
        <v-btn :disabled="!owner" color="primary" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="3">
        <v-progress-linear v-model="uploadProgress"/>
        <v-btn :disabled="importing" color="primary" @click.native="createApplication()">Enregistrer la configuration</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import { mapState } from 'vuex'
import eventBus from '../event-bus'
import OwnerPick from './OwnerPick.vue'

export default {
  components: { OwnerPick },
  props: ['initApp'],
  data: () => ({
    currentStep: null,
    owner: 'user',
    uploadProgress: 0,
    description: null,
    applicationUrl: null,
    configurableApplications: [],
    importing: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
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
        this.description = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications/_description', { params: { url: this.applicationUrl } })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération de la description de l'application` })
      }
    },
    async createApplication() {
      const options = { headers: { 'x-organizationId': 'user' } }
      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      this.importing = true
      try {
        const application = await this.$axios.$post(this.env.publicUrl + '/api/v1/applications', { ...this.description, url: this.applicationUrl }, options)
        this.$router.push({ path: `/application/${application.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la création de la configuration d'application` })
        this.importing = false
      }
    }
  }
}
</script>
