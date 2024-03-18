<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <v-row class="mx-0">
      <v-col class="pa-0">
        <template v-if="(dataset.isVirtual || dataset.isRest || dataset.isMetaOnly || simpleMode) && journal">
          <v-list-item
            v-if="journal[0] && dataset.status !== 0"
            :class="`pa-2 event-${journal[0].type}`"
          >
            <v-list-item-avatar
              v-if="['finalize-end', 'publication', 'error', 'draft-cancelled'].includes(journal[0].type)"
              class="ml-0 my-0"
            >
              <v-icon :color="events[journal[0].type].color || 'primary'">
                {{ events[journal[0].type].icon }}
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-avatar v-else>
              <v-progress-circular
                :size="20"
                :width="3"
                small
                indeterminate
                color="primary"
              />
            </v-list-item-avatar>
            <span :class="events[journal[0].type].color ? `${events[journal[0].type].color}--text` : ''">
              {{ events[journal[0].type] && (events[journal[0].type].text[$i18n.locale] || events[journal[0].type].text[$i18n.defaultLocale]) }}
            </span>
          </v-list-item>
        </template>
        <v-stepper
          v-else
          id="status-stepper"
          :value="currentStep"
          alt-labels
          class="elevation-0"
          style="background: transparent"
        >
          <v-stepper-header>
            <template v-for="(step, i) in steps">
              <v-divider
                v-if="i>0"
                :key="'d'+i"
              />
              <v-stepper-step
                :key="i"
                :rules="[() => !(dataset.status === 'error' && currentStep === i)]"
                :step="i"
                :complete="currentStep > i"
                :color="currentStep === i ? 'accent' : (step.color || 'primary')"
              >
                <v-tooltip top>
                  <template #activator="{on}">
                    <span v-on="on">{{ step.title }}</span>
                  </template>
                  {{ step.description }}
                </v-tooltip>
              </v-stepper-step>
            </template>
          </v-stepper-header>
        </v-stepper>
      </v-col>
    </v-row>
    <v-row
      v-if="journal && dataset.status==='error'"
      class="mx-0 px-2"
    >
      <v-alert
        type="error"
        style="width: 100%"
        outlined
      >
        <p
          class="mb-0"
          v-html="journal[0].data"
        />
        <template #append>
          <v-btn
            icon
            title="Relancer"
            color="primary"
            @click="patch({})"
          >
            <v-icon>mdi-play</v-icon>
          </v-btn>
        </template>
      </v-alert>
    </v-row>
    <v-row
      v-if="dataset.draftReason"
      class="mx-0 px-2"
    >
      <v-alert
        type="info"
        style="width: 100%"
        outlined
      >
        <v-row align="center">
          <v-col
            v-if="dataset.draftReason.key === 'file-new'"
            class="grow"
          >
            <p v-t="'draftNew1'" />
            <p
              v-t="'draftNew2'"
              class="mb-0"
            />
          </v-col>
          <v-col
            v-else-if="dataset.draftReason.key === 'file-updated'"
            class="grow"
          >
            <p v-t="'draftUpdated1'" />
            <p
              v-if="dataset.status === 'finalized'"
              v-t="'draftUpdated2'"
            />
            <p
              v-if="dataset.status === 'finalized' && can('validateDraft')"
              v-t="'draftUpdatedCan'"
              class="mb-0"
            />
            <p
              v-if="dataset.status === 'finalized' && !can('validateDraft')"
              v-t="'draftUpdatedCannot'"
              class="mb-0"
            />
            <p
              v-if="draftError"
              class="mt-4 mb-0 error--text"
              v-html="draftError.data"
            />
          </v-col>
          <v-col
            v-else
            class="grow"
          >
            {{ dataset.draftReason.message }}
          </v-col>
          <v-col class="shrink text-center">
            <v-btn
              v-if="dataset.draftReason.key !== 'file-new' && (dataset.status === 'error' || dataset.status === 'finalized')"
              v-t="'cancelDraft'"
              :disabled="!can('cancelDraft')"
              color="warning"
              class="ma-1"
              @click="cancelDraft"
            />
            <v-btn
              v-if="dataset.status === 'finalized'"
              v-t="'validateDraft'"
              :disabled="!can('validateDraft')"
              color="primary"
              class="ma-1"
              @click="validateDraft"
            />
          </v-col>
          <v-col class="shrink" />
        </v-row>
      </v-alert>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  draftNew1: Le jeu de données a été créé en mode brouillon. Cet état vous permet de travailler son paramétrage.
  draftNew2: Vérifiez que le fichier a bien été lu, parcourez les 100 premières lignes de la donnée, ajoutez des concepts au schéma, configurez des extensions, etc. Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftUpdated1: Le jeu de données est passé en mode brouillon suite au chargement d'un nouveau fichier.
  draftUpdated2: Le brouillon contient au moins une incompatibilité. Vérifiez que le fichier a bien été lu et que le schéma est correct, parcourez les 100 premières lignes de la donnée, etc.
  draftUpdatedCan: Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftUpdatedCannot: Vous n'avez pas la permission pour publier ce brouillon, peut-être devriez-vous contacter un administrateur ?
  cancelDraft: Annuler le brouillon
  validateDraft: Valider le brouillon
  loadTitle: Chargement
  loadDesc: Le fichier est chargé sur le service
  convertTitle: Conversion
  convertDesc: Le fichier est converti dans un format qui va faciliter son traitement
  analysisTitle: Analyse
  analysisDesc: Analyse des données et détection automatique du schéma associé
  extensionTitle: Enrichissement
  extensionDesc: Les données sont enrichies à partir des données de référence
  indexingTitle: Indexation
  indexingDesc: Les données sont indexées pour faciliter leur manipulation
  finalizingTitle: Finalisation
  finalizingDesc: Derniers traitements avant que le jeu de données ne soit utilisable
en:
  draftNew1: The dataset was created in draft mode. This state allow you to work on its configuration.
  draftNew2: Check that the file was property read, browse the first 100 lines, add concepts to the schema, configure extensions, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  draftUpdated1: The dataset was switched to draft mode following the upload of a new file.
  draftUpdated2: The draft contains at least one incompatibility. Check that the file was property read, browse the first 100 lines, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  cancelDraft: Cancel the draft
  validateDraft: Validate the draft
  loadTitle: Loading
  loadDesc: The file is loaded in the service
  convertTitle: Conversion
  convertDesc: The file is converted in a format that will make its processing easier
  analysisTitle: Analysis
  analysisDesc: Data analysis and automatic schema detection
  extensionTitle: Extension
  extensionDesc: The data is extended using master-data sources
  indexingTitle: Indexing
  indexingDesc: The data is indexed to make it easier to handle
  finalizingTitle: Finalizing
  finalizingDesc: Last processing step before the dataset is fully usable
</i18n>

<script>
const events = require('~/../shared/events.json').dataset
const { mapState, mapGetters, mapActions } = require('vuex')

export default {
  props: {
    simpleMode: { type: Boolean, default: false }
  },
  data () {
    return {
      events,
      steps: [
        { title: this.$t('loadTitle'), description: this.$t('loadDesc') },
        { title: this.$t('convertTitle'), description: this.$t('convertDesc') },
        { title: this.$t('analysisTitle'), description: this.$t('analysisDesc') },
        { title: this.$t('extensionTitle'), description: this.$t('extensionDesc') },
        { title: this.$t('indexingTitle'), description: this.$t('indexingDesc') },
        { title: this.$t('finalizingTitle'), description: this.$t('finalizingDesc'), color: 'success' }
      ]
    }
  },
  computed: {
    ...mapState(['projections']),
    ...mapState('dataset', ['dataset', 'journal', 'eventStates']),
    ...mapGetters('dataset', ['can']),
    nonErrorStatus () {
      // is status is in error, get the previous state from the journal
      if (this.dataset.status === 'error') {
        const idx = (this.journal || []).findIndex(e => e.type === 'error')
        if (idx < 0) return 'loaded' // this should not happen ?
        return this.eventStates[this.journal[idx + 1].type] ?? 'loaded'
      } else {
        return this.dataset.status
      }
    },
    draftError () {
      let draftError
      if (this.dataset.status === 'finalized' && this.dataset.draftReason) {
        for (const event of this.journal) {
          console.log(event)
          if (!event.draft || event.type === 'analyze-start') break
          if (event.type === 'error') draftError = event
        }
      }
      return draftError
    },
    currentStep () {
      const status = this.nonErrorStatus
      if (status === 'stored') return 1
      if (status === 'normalized') return 2
      if (status === 'analyzed') return 3
      if (status === 'extended') return 4
      if (status === 'indexed') return 5
      if (status === 'finalized') return 6
      return 0
    }
  },
  methods: {
    ...mapActions('dataset', ['patch', 'validateDraft', 'cancelDraft'])
  }
}
</script>

<style lang="css">
</style>
