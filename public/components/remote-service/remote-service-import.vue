<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!apiDoc"
        step="1"
        editable
      >
        {{ $t('selectService') }}
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          v-model="apiDocUrl"
          :items="configurableRemoteServices"
          item-value="url"
          item-text="title"
          :label="$t('choseOne')"
          @input="downloadFromUrl"
        />
        <v-text-field
          v-model="apiDocUrl"
          :label="$t('loadUrl')"
          @change="downloadFromUrl"
        />
        <p
          v-if="apiDoc"
          v-html="marked(apiDoc.info.description)"
        />
        <v-btn
          :disabled="!apiDoc"
          color="primary"
          @click.native="importApi()"
        >
          {{ $t('save') }}
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          {{ $t('cancel') }}
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  selectService: Sélection du service
  choseOne: Choisissez un service à configurer
  loadUrl: Ou saisissez une URL de documentation d'API
  save: Enregistrer
  cancel: Annuler
en:
  selectService: Select a service
  choseOne: Chose a service to configure
  loadUrl: Or type the URL of a API documentation
  save: Save
  cancel: Cancel
</i18n>

<script>
  import { marked } from 'marked'
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    components: { },
    props: ['initService'],
    data: () => ({
      currentStep: null,
      owner: null,
      uploadProgress: 0,
      apiDoc: null,
      apiDocUrl: null,
      configurableRemoteServices: [],
      marked,
      importing: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
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
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération du fichier' })
        }
      },
      async checkApi(api) {
        try {
          await this.$axios.$post('api/v1/_check-api', api)
          this.apiDoc = api
        } catch (error) {
          eventBus.$emit('notification', { type: 'error', msg: 'Le format de la description de l\'API est incorrect' })
        }
      },
      async importApi() {
        const securities = (this.apiDoc.security || []).map(s => Object.keys(s).pop()).map(s => this.apiDoc.components.securitySchemes[s])
        const apiKeySecurity = securities.find(s => s.type === 'apiKey')

        this.importing = true
        try {
          const body = {
            apiDoc: this.apiDoc,
            url: this.apiDocUrl,
            server: this.apiDoc.servers && this.apiDoc.servers.length && this.apiDoc.servers[0].url,
          }
          if (apiKeySecurity) body.apiKey = { in: apiKeySecurity.in, name: apiKeySecurity.name }
          const remoteService = await this.$axios.$post('api/v1/remote-services', body)
          this.$router.push({ path: `/remote-service/${remoteService.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import de la description du service' })
          this.importing = false
        }
      },
    },
  }
</script>
