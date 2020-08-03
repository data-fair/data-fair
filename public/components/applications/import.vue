<template>
  <v-stepper v-model="currentStep" class="elevation-0">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!dataset"
        step="1"
        :editable="!$route.query.dataset"
      >
        Sélection du jeu de données
      </v-stepper-step>

      <v-stepper-step
        :complete="!!baseApp"
        step="2"
        editable
      >
        Sélection de l'application
      </v-stepper-step>

      <v-stepper-step
        :complete="!!title"
        step="3"
        editable
      >
        Informations
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet>
          <v-form ref="datasetForm" style="max-width: 500px">
            <v-jsf
              v-model="datasetModel"
              :schema="datasetSchema"
              :options="vjsfOptions"
            />
          </v-form>
          <v-btn
            :disabled="!dataset"
            color="primary"
            @click.native="currentStep = 2"
          >
            Continuer
          </v-btn>
        </v-sheet>
      </v-stepper-content>

      <v-stepper-content step="2">
        <v-sheet>
          <base-apps
            v-if="dataset"
            v-model="baseApp"
            :dataset="dataset"
          />
        </v-sheet>
        <v-btn
          :disabled="!baseApp"
          color="primary"
          @click.native="currentStep = 3"
        >
          Continuer
        </v-btn>
      </v-stepper-content>

      <v-stepper-content step="3">
        <v-sheet>
          <v-text-field
            v-model="title"
            style="max-width: 500px;"
            name="title"
            label="Titre"
          />
        </v-sheet>
        <v-btn
          :disabled="!title"
          color="primary"
          @click.native="createApplication()"
        >
          Enregistrer
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'
  import BaseApps from '~/components/applications/base-apps.vue'

  export default {
    components: { VJsf, BaseApps },
    props: ['initApp'],
    async fetch() {
      if (this.$route.query.dataset) {
        await this.getDataset(this.$route.query.dataset)
        this.currentStep = 2
      }
    },
    data: () => ({
      currentStep: null,
      datasetModel: null,
      dataset: null,
      baseApp: null,
      applicationUrl: null,
      configurableApplications: [],
      importing: false,
      datasetSchema: {
        title: 'Jeu de données',
        type: 'object',
        'x-fromUrl': 'api/v1/datasets?status=finalized&q={q}&select=id,title&owner={context.owner.type}:{context.owner.id}',
        'x-itemsProp': 'results',
        'x-itemTitle': 'title',
        'x-itemKey': 'href',
        properties: {
          href: { type: 'string' },
          title: { type: 'string' },
          id: { type: 'string' },
          schema: { type: 'array' },
        },
      },
      title: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env']),
      vjsfOptions() {
        return {
          context: { owner: this.activeAccount },
          locale: 'fr',
          rootDisplay: 'expansion-panels',
          // rootDisplay: 'tabs',
          expansionPanelsProps: {
            value: 0,
            hover: true,
          },
          dialogProps: {
            maxWidth: 500,
            overlayOpacity: 0, // better when inside an iframe
          },
        }
      },
    },
    watch: {
      datasetModel() {
        this.getDataset(this.datasetModel.id)
      },
      dataset() {
        this.baseApp = null
      },
      baseApp() {
        this.title = this.dataset.title + ' - ' + this.baseApp.title
      },
    },
    methods: {
      async getDataset(id) {
        this.dataset = await this.$axios.$get(`api/v1/datasets/${id}`)
      },
      async createApplication() {
        this.importing = true
        try {
          const application = await this.$axios.$post('api/v1/applications', {
            url: this.baseApp.url,
            title: this.title,
            configurationDraft: { datasets: [{ href: this.dataset.href, title: this.dataset.title, id: this.dataset.id }] },
          })
          this.$router.push({ path: `/application/${application.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la création de la visualisation' })
          this.importing = false
        }
      },
    },
  }
</script>
