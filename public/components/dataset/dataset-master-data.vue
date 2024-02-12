<template>
  <v-container fluid>
    <p>
      Transformez ce jeu de données en une donnée de référence et augmentez sa ré-utilisabilité dans de multiples contextes.
    </p>
    <v-form ref="form">
      <lazy-v-jsf
        v-if="editMasterData"
        v-model="editMasterData"
        :schema="schema"
        :options="{context, locale: 'fr'}"
      >
        <template #singleSearchs-before>
          <tutorial-alert
            id="masterData-singleSearchs"
            persistent
          >
            Permettez à vos utilisateurs de récupérer une liste de résultats à partir d'une recherche textuelle sur une colonne de libellés. Cette fonctionnalité permet de créer des champs de recherche dans les formulaires d'édition de ligne des jeux éditables.
          </tutorial-alert>
        </template>
        <template #bulkSearchs-before>
          <tutorial-alert
            id="masterData-bulkSearchs"
            persistent
          >
            Permettez à vos utilisateurs de récupérer un grand nombre de lignes à partir d'une règle de correspondance simple. Cette fonctionnalité permet de créer une nouvelle source d'enrichissement.
          </tutorial-alert>
        </template>
        <template #virtualDatasets-before>
          <tutorial-alert
            id="masterData-virtualDatasets"
            persistent
          >
            Proposez à vos utilisateurs de créer des jeux virtuels à partir de ce jeu de données. C'est une option intéressante pour faciliter la création de vues filtrées de cette donnée.
          </tutorial-alert>
        </template>
        <template #standardSchema-before>
          <tutorial-alert
            id="masterData-standardSchema"
            persistent
          >
            Proposez à vos utilisateurs d'initialiser des jeux éditables à partir des métadonnées et des données de ce jeu de données. C'est une option intéressante pour faciliter l'inittialisation de jeux de données homogènes.
          </tutorial-alert>
        </template>
      </lazy-v-jsf>
      <v-row class="px-2 mt-4">
        <v-spacer />
        <v-btn
          v-t="'save'"
          color="primary"
          :disabled="!hasChanges"
          @click="validate"
        />
      </v-row>
    </v-form>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  save: Enregistrer
en:
  save: Save
</i18n>

<script>
import { mapState, mapActions } from 'vuex'
const datasetSchema = require('~/../contract/dataset.js')

const defaultMasterData = { standardSchema: {}, virtualDatasets: {}, singleSearchs: [], bulkSearchs: [] }

export default {
  data () {
    return {
      editMasterData: null
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    schema () {
      return JSON.parse(JSON.stringify(datasetSchema.properties.masterData))
    },
    context () {
      return {
        dataset: this.dataset,
        stringProperties: this.dataset.schema
          .filter(p => p.type === 'string')
          .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })),
        searchProperties: this.dataset.schema
          .filter(p => p.type === 'string' && (!p['x-capabilities'] || !p['x-capabilities'].textStandard))
          .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })),
        propertiesWithConcepts: this.dataset.schema
          .filter(p => p['x-refersTo'])
          .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key, 'x-refersTo': p['x-refersTo'] })),
        hasDateIntervalConcepts: !!(this.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/startDate') && this.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/endDate'))
      }
    },
    hasChanges () {
      return JSON.stringify(this.dataset.masterData || defaultMasterData) !== JSON.stringify(this.editMasterData)
    }
  },
  watch: {
    'dataset.masterData': {
      handler () {
        this.editMasterData = JSON.parse(JSON.stringify(this.dataset.masterData || defaultMasterData))
      },
      immediate: true
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit']),
    validate () {
      const valid = this.$refs.form.validate()
      if (valid) this.patchAndCommit({ masterData: this.editMasterData })
    }
  }
}
</script>

<style lang="css" scoped>
</style>
