<template lang="html">
  <v-container fluid class="pa-0">
    <v-row>
      <v-col class="pa-0">
        <template v-if="(dataset.isVirtual || dataset.isRest) && journal">
          <v-list-item
            v-if="journal[0] && dataset.status !== 0"
            :class="`pa-2 event-${journal[0].type}`"
          >
            <v-list-item-avatar v-if="['finalize-end', 'publication', 'error'].includes(journal[0].type)" class="ml-0 my-0">
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
              {{ events[journal[0].type] && events[journal[0].type].text }}
            </span>
          </v-list-item>
        </template>
        <v-stepper
          v-else
          id="status-stepper"
          :value="stateFromStatus(dataset.status)"
          alt-labels
          class="elevation-0"
          style="background: transparent"
        >
          <v-stepper-header>
            <template v-for="(step, i) in steps">
              <v-divider v-if="i>0" :key="'d'+i" />
              <v-stepper-step
                :key="i"
                :rules="[() => stateFromStatus(dataset.status) !== i+1 || dataset.status !== 'error']"
                :step="i+1"
                :complete="stateFromStatus(dataset.status) > i+1"
                :color="stateFromStatus(dataset.status) === i+1 ? 'accent' : (step.color || 'primary')"
              >
                <v-tooltip top>
                  <template v-slot:activator="{on}">
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
    <v-alert
      v-if="journal && dataset.status==='error'"
      type="error"
      outlined
    >
      {{ journal[0].data }}
      <v-btn
        icon
        title="Relancer"
        color="primary"
        @click="patch({})"
      >
        <v-icon>mdi-play</v-icon>
      </v-btn>
    </v-alert>
    <v-row v-if="dataset.draftReason" class="px-2">
      <v-alert
        type="info"
        style="width: 100%"
        outlined
      >
        <v-row align="center">
          <v-col v-if="dataset.draftReason.key === 'file-new'" class="grow">
            <p v-="'draftNew1'" />
            <p v-t="'draftNew2'" class="mb-0" />
          </v-col>
          <v-col v-else-if="dataset.draftReason.key === 'file-updated'" class="grow">
            <p v-t="'draftUpdated1'" />
            <p v-t="'draftUpdated2'" class="mb-0" />
          </v-col>
          <v-col v-else class="grow">
            {{ dataset.draftReason.message }}
          </v-col>
          <v-col class="shrink text-center">
            <v-btn
              v-if="dataset.draftReason.key !== 'file-new'"
              v-t="'cancelDraft'"
              color="warning"
              class="ma-1"
              :disabled="dataset.status !== 'error' && dataset.status !== 'finalized'"
              @click="cancelDraft"
            />
            <v-btn
              color="primary"
              class="ma-1"
              :disabled="dataset.status !== 'finalized'"
              c-t="'validateDraft'"
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
  draftUpdated2: Vérifiez que le fichier a bien été lu, parcourez les 100 premières lignes de la donnée, etc. Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  cancelDraft: Annuler le brouillon
  validateDraft: Valider le brouillon
en:
  draftNew1: The dataset was created in draft mode. This state allow you to work on its configuration.
  draftNew2: Check that the file was property read, browse the first 100 lines, add concepts to the schema, configure extensions, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  draftUpdated1: The dataset was switched to draft mode following the upload of a new file.
  draftUpdated2: Check that the file was property read, browse the first 100 lines, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  cancelDraft: Cancel the draft
  validateDraft: Validate the draft
</i18n>

<script>
  const events = require('~/../shared/events.json').dataset
  const { mapState, mapActions } = require('vuex')

  export default {
    data() {
      return {
        events,
        steps: [
          { title: 'Chargement', description: 'Le fichier est chargé sur notre plateforme' },
          { title: 'Conversion', description: 'Le fichier est converti dans un format qui va faciliter son traitement' },
          { title: 'Analyse', description: 'Analyse des données et détection automatique du schéma associé' },
          { title: 'Enrichissement', description: 'Les données sont enrichies à partir des données de référence' },
          { title: 'Indexation', description: 'Les données sont indexées pour faciliter leur manipulation' },
          { title: 'Finalisation', description: 'Derniers traitements avant que la source ne soit utilisable', color: 'success' },
        ],
        states: ['remote', 'uploaded', 'loaded', 'analyzed', 'extended', 'indexed', 'finalized'],
      }
    },
    computed: {
      ...mapState(['projections']),
      ...mapState('dataset', ['dataset', 'journal', 'eventStates']),
    },
    methods: {
      ...mapActions('dataset', ['patch', 'validateDraft', 'cancelDraft']),
      stateFromStatus(status) {
        if (status === 'updated-extended') status = 'extended'
        if (status !== 'error') return this.states.indexOf(status) + 1
        else {
          const idx = (this.journal || []).findIndex(e => e.type === 'error')
          if (idx < 0) return 0
          return this.states.indexOf(this.eventStates[this.journal[idx + 1].type]) + 1
        }
      },
    },
  }
</script>

<style lang="css">
</style>
