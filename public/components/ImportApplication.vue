<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="!!baseApp" step="1" editable>Sélection de l'application</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 2" step="2">Choix du propriétaire</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableApplications"
          v-model="applicationUrl"
          item-value="url"
          item-text="title"
          label="Choisissez une application à configurer"
          @input="downloadFromUrl"
        />
        <!--<v-text-field
          v-model="applicationUrl"
          label="Ou saisissez une URL"
          @blur="downloadFromUrl"
          @keyup.native.enter="downloadFromUrl"
        />-->
        <v-text-field
          v-if="baseApp"
          v-model="baseApp.title"
          label="Titre"
        />
        <p v-if="baseApp" v-html="baseApp.description"/>
        <v-btn :disabled="!baseApp" color="primary" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <owner-pick v-if="baseApp" v-model="owner" :restriction="baseApp.public ? null : baseApp.privateAccess"/>
        <v-btn :disabled="!owner" color="primary" @click.native="createApplication()">Enregistrer</v-btn>
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
    owner: null,
    baseApp: null,
    applicationUrl: null,
    configurableApplications: [],
    importing: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  async mounted() {
    let privateAccess = `user:${this.user.id}`
    this.user.organizations.forEach(o => {
      privateAccess += `,organization:${o.id}`
    })
    this.configurableApplications = (await this.$axios.$get('api/v1/base-applications', { params: {
      privateAccess,
      size: 10000
    } })).results
    if (this.initApp) {
      this.applicationUrl = this.initApp
      this.downloadFromUrl()
    }
  },
  methods: {
    async downloadFromUrl() {
      if (!this.applicationUrl) return
      this.baseApp = null
      try {
        this.baseApp = await this.$axios.$post('api/v1/base-applications', { url: this.applicationUrl })
        delete this.baseApp.id
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
        const application = await this.$axios.$post('api/v1/applications', {
          url: this.baseApp.url,
          title: this.baseApp.title,
          description: this.baseApp.description,
          applicationName: this.baseApp.applicationName
        }, options)
        this.$router.push({ path: `/application/${application.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la création de la configuration d'application` })
        this.importing = false
      }
    }
  }
}
</script>
