<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!baseApp"
        step="1"
        editable
      >
        Sélection de l'application
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet min-height="200">
          <v-select
            v-model="applicationUrl"
            :items="configurableApplications"
            item-value="url"
            item-text="title"
            label="Choisissez une application à configurer"
            @input="downloadFromUrl"
          />
          <v-text-field
            v-if="baseApp"
            v-model="baseApp.title"
            label="Titre"
          />
          <p v-if="baseApp" v-html="baseApp.description" />
        </v-sheet>
        <v-btn
          :disabled="!baseApp"
          color="primary"
          @click.native="createApplication()"
        >
          Enregistrer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    props: ['initApp'],
    data: () => ({
      currentStep: null,
      baseApp: null,
      applicationUrl: null,
      configurableApplications: [],
      importing: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
    },
    async mounted() {
      let privateAccess = `user:${this.user.id}`
      this.user.organizations.forEach(o => {
        privateAccess += `,organization:${o.id}`
      })
      this.configurableApplications = (await this.$axios.$get('api/v1/base-applications', {
        params: {
          privateAccess,
          size: 10000,
        },
      })).results
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
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération de la description de l\'application' })
        }
      },
      async createApplication() {
        this.importing = true
        try {
          const application = await this.$axios.$post('api/v1/applications', {
            url: this.baseApp.url,
            title: this.baseApp.title,
            description: this.baseApp.description,
            applicationName: this.baseApp.applicationName,
          })
          this.$router.push({ path: `/application/${application.id}/description` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la création de la configuration d\'application' })
          this.importing = false
        }
      },
    },
  }
</script>
