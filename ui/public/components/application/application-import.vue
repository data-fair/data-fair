<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <template v-if="!dataset">
        <v-stepper-step
          v-t="'selectCreationType'"
          :complete="!!creationType"
          step="1"
          :editable="!!creationType"
        />
        <v-divider />
      </template>
      <v-stepper-step
        v-if="creationType === 'copy'"
        v-t="'selectApp'"
        :complete="!!copyApp"
        step="2"
        :editable="!!copyApp"
      />
      <v-stepper-step
        v-if="creationType === 'baseApp'"
        v-t="'selectBaseApp'"
        :complete="!!baseApp"
        step="2"
        :editable="!!baseApp"
      />
      <v-divider />
      <v-stepper-step
        v-if="creationType"
        v-t="'info'"
        :complete="!!title"
        step="3"
        :editable="!!baseApp"
      />
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p v-t="'choseType'" />
        <v-row
          dense
          class="mt-2 mb-6"
        >
          <v-card
            v-for="type of creationTypes"
            :key="type"
            width="300px"
            class="ma-1"
            outlined
            hover
            tile
            @click="creationType = type; $nextTick(() => currentStep = 2);"
          >
            <v-card-title class="primary--text">
              <v-icon
                color="primary"
                class="mr-2"
              >
                {{ creationTypeIcons[type] }}
              </v-icon>
              {{ $t('type_' + type) }}
            </v-card-title>
            <v-card-text>
              {{ $t('type_desc_' + type) }}
            </v-card-text>
          </v-card>
        </v-row>
      </v-stepper-content>

      <v-stepper-content
        v-if="creationType === 'copy'"
        step="2"
      >
        <application-select
          v-model="copyApp"
          @change="currentStep = 3; title = `${copyApp.title} (${$t('copy')})`"
        />
      </v-stepper-content>

      <v-stepper-content
        v-if="creationType === 'baseApp'"
        step="2"
      >
        <p v-html="$t('customApp')" />
        <application-base-apps
          v-if="dataset || !$route.query.dataset"
          v-model="baseApp"
          :dataset="dataset"
          @input="currentStep = 3; title = dataset ? dataset.title + ' - ' + baseApp.title : baseApp.title"
        />
      </v-stepper-content>

      <v-stepper-content step="3">
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
  selectCreationType: Type d"initialisation
  choseType: Choisissez la manière dont vous souhaitez initialiser une nouvelle application.
  selectBaseApp: Sélection du modèle d'application
  selectApp: Sélection de l'application à copier
  info: Informations
  customApp: Koumoul réalise aussi des <span class="accent--text">applications personnalisées</span> sur demande. N'hésitez pas à <a href="https://koumoul.com/contact" class="">nous contacter</a> !
  title: Titre de la nouvelle application
  save: Enregistrer
  back: Retour
  creationError: Erreur pendant la création de l'application
  copy: copie
  type_copy: Copie d'application
  type_desc_copy: Copiez une configuration complète depuis une application existante.
  type_baseApp: Nouvelle configuration
  type_desc_baseApp: Créez une configuration vierge à partir d'un modèle d'application.
en:
  selectBaseApp: Application model selection
  selectApp: Application to copy
  info: Informations
  customApp: Koumoul also creates <span class="accent--text">custom applications</span> on demand. Do not hesitate <a href="https://koumoul.com/contact" class="">contacting us</a> !
  title: Title of the new application
  save: Save
  back: Back
  creationError: Error while creating the application
  copy: copy
  type_copy: Application copy
  type_desc_copy: Copy a complete configuration from an existing application.
  type_baseApp: New configuration
  type_desc_baseApp: Create a blank configuration from an application model.
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  props: ['initApp'],
  data: () => ({
    currentStep: 1,
    datasetModel: null,
    noDataset: false,
    dataset: null,
    baseApp: null,
    applicationUrl: null,
    configurableApplications: [],
    importing: false,
    title: null,
    owner: null,
    creationType: null,
    creationTypes: ['copy', 'baseApp'],
    creationTypeIcons: {
      copy: 'mdi-content-copy',
      baseApp: 'mdi-apps'
    },
    copyApp: null
  }),
  async fetch () {
    if (this.$route.query.dataset) {
      this.creationType = 'baseApp'
      this.currentStep = 2
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
        const body = { owner: this.owner, title: this.title, }

        if (this.creationType === 'copy') {
          body.url = this.copyApp.url
          body.initFrom = { application: this.copyApp.id }
        } else {
          body.url = this.baseApp.url
          body.configurationDraft = {}
          if (this.dataset) {
            body.configurationDraft.datasets = [{
              href: this.dataset.href,
              title: this.dataset.title,
              id: this.dataset.id,
              schema: this.dataset.schema
            }]
          }
        }

        const application = await this.$axios.$post('api/v1/applications', body)
        this.$router.push({ path: `/application/${application.id}` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        this.importing = false
      }
    }
  }
}
</script>
