<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!baseApp"
        step="1"
        :editable="!!baseApp"
      >
        Sélection de l'application
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :complete="!!title"
        step="2"
        :editable="!!baseApp"
      >
        Informations
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p>
          Nous réalisons aussi des <span class="accent--text">applications personnalisées</span> sur demande.
          N'hésitez pas à <a href="https://koumoul.com/contact" class="">Nous contacter</a> !
        </p>
        <application-base-apps
          v-if="dataset || !this.$route.query.dataset"
          v-model="baseApp"
          :dataset="dataset"
          @input="currentStep = 2; title = dataset ? dataset.title + ' - ' + baseApp.title : baseApp.title"
        />

        <!--<v-btn
          :disabled="!baseApp"
          color="primary"
          @click.native="currentStep = 3"
        >
          Continuer
        </v-btn>-->
      </v-stepper-content>

      <v-stepper-content step="2">
        <v-text-field
          v-model="title"
          style="max-width: 500px;"
          name="title"
          label="Titre"
        />
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
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    props: ['initApp'],
    async fetch() {
      if (this.$route.query.dataset) {
        await this.getDataset(this.$route.query.dataset)
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
            configurationDraft.datasets = [{
              href: this.dataset.href,
              title: this.dataset.title,
              id: this.dataset.id,
              schema: this.dataset.schema,
            }]
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
