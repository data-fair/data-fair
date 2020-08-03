<template lang="html">
  <v-container fluid class="pa-0">
    <v-row>
      <v-col class="pa-0">
        <template v-if="dataset.isVirtual || dataset.isRest">
          <v-list-item
            v-if="journal[0] && dataset.status !== 0"
            :class="'pa-2 event-' + journal[0].type"
          >
            <v-list-item-avatar v-if="['finalize-end', 'publication'].includes(journal[0].type)" class="ml-0 my-0">
              <v-icon>{{ events[journal[0].type].icon }}</v-icon>
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
            <span>{{ events[journal[0].type] && events[journal[0].type].text }}</span>
          </v-list-item>
        </template>
        <v-stepper
          v-else
          id="status-stepper"
          :value="stateFromStatus(dataset.status)"
          alt-labels
          class="elevation-0"
        >
          <v-stepper-header>
            <template v-for="(step, i) in steps">
              <v-divider v-if="i>0" :key="'d'+i" />
              <v-stepper-step
                :key="i"
                :rules="[() => stateFromStatus(dataset.status) !== i+1 || dataset.status !== 'error']"
                :step="i+1"
                :complete="stateFromStatus(dataset.status) > i+1"
                :color="stateFromStatus(dataset.status) === i+1 ? 'accent' : 'primary'"
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
  </v-container>
</template>

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
          { title: 'Indexation', description: 'Les données sont indexées pour faciliter leur manipulation' },
          { title: 'Enrichissement', description: 'Les données sont enrichies à partir des données de référence' },
          { title: 'Finalisation', description: 'Derniers traitements avant que la source ne soit utilisable' },
        ],
        states: ['remote', 'uploaded', 'loaded', 'analyzed', 'schematized', 'indexed', 'extended', 'finalized'],
        stateSteps: [1, 2, 3, 4, 4, 5, 6, 7],
        eventStates: {
          'data-updated': 'uploaded',
          'download-end': 'uploaded',
          'convert-start': 'uploaded',
          'convert-end': 'loaded',
          'analyze-start': 'loaded',
          'analyze-end': 'analyzed',
          'schematize-start': 'analyzed',
          'schematize-end': 'schematized',
          'index-start': 'schematized',
          'index-end': 'indexed',
          'extend-start': 'indexed',
          'extend-end': 'extended',
          'finalize-start': 'extended',
          'finalize-end': 'finalized',
          error: 'error',
        },
      }
    },
    computed: {
      ...mapState(['projections']),
      ...mapState('dataset', ['dataset', 'journal']),
    },
    methods: {
      ...mapActions('dataset', ['patch']),
      stateFromStatus(status) {
        if (status !== 'error') return this.stateSteps[this.states.indexOf(status)]
        else {
          const idx = this.journal.findIndex(e => e.type === 'error')
          if (idx < 0) return 0
          return this.stateSteps[this.states.indexOf(this.eventStates[this.journal[idx + 1].type])]
        }
      },
    },
  }
</script>

<style lang="css">
</style>
