<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        v-t="'selectApplication'"
        :complete="!!baseApp"
        step="1"
        :editable="!!baseApp"
      />
      <v-divider />
      <v-stepper-step
        v-t="'info'"
        :complete="!!title"
        step="2"
        :editable="!!baseApp"
      />
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p v-html="$t('customApp')" />
        <application-base-apps
          v-if="dataset || !$route.query.dataset"
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
        <owner-pick
          v-model="owner"
          hide-single
          :current-owner="dataset?.owner"
          :restriction="[activeAccount]"
          message="Choisissez le propriétaire de la nouvelle application :"
        />
        <v-text-field
          v-model="title"
          style="max-width: 500px;"
          name="title"
          :label="$t('title')"
        />
        <v-btn
          v-t="'save'"
          :disabled="!title"
          color="primary"
          @click.native="createApplication()"
        />
        <v-btn
          v-t="'back'"
          text
          class="ml-2"
          @click.native="currentStep = 1"
        />
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  selectApplication: Sélection du modèle d'application
  info: Informations
  customApp: Koumoul réalise aussi des <span class="accent--text">applications personnalisées</span> sur demande. N'hésitez pas à <a href="https://koumoul.com/contact" class="">nous contacter</a> !
  title: Titre
  save: Enregistrer
  back: Retour
  creationError: Erreur pendant la création de l'application
en:
  selectApplication: Application model selection
  info: Informations
  customApp: Koumoul also creates <span class="accent--text">custom applications</span> on demand. Do not hesitate <a href="https://koumoul.com/contact" class="">contacting us</a> !
  title: Title
  save: Save
  back: Back
  creationError: Error while creating the application
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  props: ['initApp'],
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
    owner: null
  }),
  async fetch () {
    if (this.$route.query.dataset) {
      await this.getDataset(this.$route.query.dataset)
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env']),
    vjsfOptions () {
      return {
        context: { owner: this.activeAccount },
        locale: 'fr',
        rootDisplay: 'expansion-panels',
        // rootDisplay: 'tabs',
        expansionPanelsProps: {
          value: 0,
          hover: true
        },
        dialogProps: {
          maxWidth: 500,
          overlayOpacity: 0 // better when inside an iframe
        }
      }
    }
  },
  watch: {
    datasetModel () {
      if (!this.datasetModel) this.dataset = null
      else {
        this.getDataset(this.datasetModel.id)
        this.noDataset = false
      }
    },
    noDataset () {
      if (this.noDataset) this.datasetModel = null
    },
    dataset () {
      this.baseApp = null
    }
  },
  methods: {
    async getDataset (id) {
      this.dataset = await this.$axios.$get(`api/v1/datasets/${id}`)
    },
    async createApplication () {
      this.importing = true
      try {
        const configurationDraft = {}
        if (this.dataset) {
          configurationDraft.datasets = [{
            href: this.dataset.href,
            title: this.dataset.title,
            id: this.dataset.id,
            schema: this.dataset.schema
          }]
        }
        const application = await this.$axios.$post('api/v1/applications', {
          owner: this.owner,
          url: this.baseApp.url,
          title: this.title,
          configurationDraft
        })
        this.$router.push({ path: `/application/${application.id}` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        this.importing = false
      }
    }
  }
}
</script>
