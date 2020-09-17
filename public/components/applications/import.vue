<template>
  <v-stepper v-model="currentStep" class="elevation-0">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!dataset || !!noDataset"
        step="1"
        :editable="!$route.query.dataset"
      >
        Sélection du jeu de données
      </v-stepper-step>

      <v-stepper-step
        :complete="!!baseApp"
        step="2"
        :editable="!!baseApp"
      >
        Sélection de l'application
      </v-stepper-step>

      <v-stepper-step
        :complete="!!title"
        step="3"
        :editable="!!baseApp"
      >
        Informations
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet>
          <p>Sélectionnez un jeu de données sur lequel la visualisation sera basée.</p>
          <p>Les applications proposées pour configurer la visualisation dépendront des caractéristiques de ce jeu de données : types des colonnes et concepts.</p>
          <p>Vous pouvez également cocher "Aucun jeu de données" pour configurer les quelques applications particulières qui ne nécessitent pas de jeu de données.</p>
          <v-form
            ref="datasetForm"
            style="max-width: 500px"
            class="mt-6 pl-3"
          >
            <v-jsf
              v-model="datasetModel"
              :schema="datasetSchema"
              :options="vjsfOptions"
            />
            <v-checkbox v-model="noDataset" label="Aucun jeu de données" />
            <v-btn
              :disabled="!dataset && !noDataset"
              color="primary"
              @click.native="currentStep = 2"
            >
              Continuer
            </v-btn>
          </v-form>
        </v-sheet>
      </v-stepper-content>

      <v-stepper-content step="2">
        <v-sheet>
          <p>
            Nous réalisons aussi des <span class="accent--text">applications personnalisées</span> sur demande.
            N'hésitez pas à <a href="https://koumoul.com/contact" class="">Nous contacter</a> !
          </p>
          <base-apps
            v-model="baseApp"
            :dataset="dataset"
            @input="currentStep = 3; title = dataset ? dataset.title + ' - ' + baseApp.title : baseApp.title"
          />
        </v-sheet>
        <v-btn
          v-if="!$route.query.dataset"
          text
          @click.native="currentStep = 1"
        >
          Retour
        </v-btn>
        <!--<v-btn
          :disabled="!baseApp"
          color="primary"
          @click.native="currentStep = 3"
        >
          Continuer
        </v-btn>-->
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
        <v-btn
          text
          class="ml-2"
          @click.native="currentStep = 2"
        >
          Retour
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
      noDataset: false,
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
        if (!this.datasetModel) this.dataset = null
        else {
          this.getDataset(this.datasetModel.id)
          this.noDataset = false
        }
      },
      noDataset() {
        if (this.noDataset) this.datasetModel = null
      },
      dataset() {
        this.baseApp = null
      },
    },
    methods: {
      async getDataset(id) {
        this.dataset = await this.$axios.$get(`api/v1/datasets/${id}`)
      },
      async createApplication() {
        this.importing = true
        try {
          const configurationDraft = {}
          if (this.dataset) {
            configurationDraft.datasets = [{ href: this.dataset.href, title: this.dataset.title, id: this.dataset.id }]
          }
          const application = await this.$axios.$post('api/v1/applications', {
            url: this.baseApp.url,
            title: this.title,
            configurationDraft,
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
