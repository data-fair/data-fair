<template lang="html">
  <v-row>
    <v-col class="my-4">
      <p
        v-if="dataset.extensions && !dataset.extensions.length"
        v-t="'message'"
      />
      <!-- 450 matches the size of the container in the embed page, to prevent overflowing iframe -->
      <v-menu
        v-model="addExtensionDialog"
        :max-height="450"
      >
        <template #activator="{ on }">
          <v-btn
            v-if="can('writeDescription')"
            v-t="'addExtension'"
            color="primary"
            v-on="on"
          />
        </template>

        <v-list>
          <template v-if="!availableExtensions">
            <v-skeleton-loader type="list-item-two-line" />
            <v-skeleton-loader type="list-item-two-line" />
            <v-skeleton-loader type="list-item-two-line" />
          </template>

          <template v-else>
            <v-list-item
              v-for="extension in availableExtensions.filter(e => !e.disabled)"
              :key="extension.id"
              @click="localExtensions.push({
                active: true,
                remoteService: extension.remoteService,
                action: extension.action.id,
                select: defaultFields[extension.action.id] || []
              })"
            >
              <v-list-item-content>
                <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
            <v-list-item
              v-for="extension in availableExtensions.filter(e => e.disabled)"
              :key="extension.id"
              :color="extension.color"
              :input-value="!!extension.disabled"
            >
              <v-list-item-content>
                <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
                <v-list-item-subtitle>{{ extension.disabled }}</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>
      <v-row class="mt-0">
        <v-col
          v-for="(extension, idx) in localExtensions"
          :key="extension.remoteService + '--' + extension.action"
          cols="12"
          md="6"
        >
          <v-card
            :loading="!ready"
            height="100%"
            :outlined="!hasChanges(extension)"
          >
            <v-card-title>
              {{ remoteServicesMap[extension.remoteService] && remoteServicesMap[extension.remoteService].actions[extension.action] && remoteServicesMap[extension.remoteService].actions[extension.action].summary }}
            </v-card-title>
            <v-card-text style="margin-bottom:40px;">
              <v-autocomplete
                v-if="extension.active && remoteServicesMap[extension.remoteService] && selectFields[extension.remoteService + '_' + extension.action].fieldsAndTags"
                v-model="extension.select"
                :disabled="!can('writeDescription')"
                :items="selectFields[extension.remoteService + '_' + extension.action].fieldsAndTags"
                item-value="name"
                item-text="title"
                :label="$t('additionalCols')"
                multiple
                :placeholder="$t('allColsOut')"
                persistent-hint
                chips
                deletable-chips
              />
            </v-card-text>
            <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
              <dataset-extension-details-dialog
                :extension="extension"
                :disabled="hasChanges(extension)"
              />
              <confirm-menu
                v-if="can('writeDescription')"
                yes-color="warning"
                :text="$t('confirmDeleteText')"
                :tooltip="$t('confirmDeleteTooltip')"
                @confirm="removeExtension(idx)"
              />
              <v-spacer />
              <v-btn
                v-t="'apply'"
                color="primary"
                depressed
                :disabled="!hasChanges(extension)"
                @click="applyExtension(idx)"
              />
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  message: Étendez votre jeu de données avec de nouvelles colonnes issues de sources de données de référence.
  addExtension: Ajouter une extension
  additionalCols: Colonnes additionnelles
  allColsOut: Toutes les colonnes
  confirmDeleteTooltip: Supprimer l'extension
  confirmDeleteText: Souhaitez-vous confirmer la suppression ?
  apply: Appliquer
  extensionExists: Cette extension a déjà été configurée
  missingConcepts: "Il faut associer au moins l'un des concepts suivants à vos colonnes : {concepts}"
  missingConcept: "Il faut associer le concept suivant à une de vos colonnes : ${concept}"
en:
  message: Extend your dataset with new columns taken from master-data sources.
  addExtensions: Add an extension
  additionalCols: Additional columns
  allColsOut: All the columns
  confirmDeleteTooltip: Delete the extension
  confirmDeleteText: Do you want to confirm the deletion ?
  apply: Apply
  extensionExists: This extension was already configured
  missingConcepts: "You must tag your columns with at least one of these concepts: {concepts}"
  missingConcept: "You must tag one of your columns with this concept: ${concept}"
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import logger from '~/logger'

export default {
  data () {
    return {
      ready: false,
      addExtensionDialog: false,
      newExtension: null,
      localExtensions: null,
      defaultFields: {
        findEntreprisesBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFEN'],
        findEtablissementsBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFET'],
        postCoords: ['lat', 'lon'],
        findCityBulk: ['population.popMuni', 'DEP', 'REG'],
        findParcellesBulk: ['lat', 'lon']
      }
    }
  },
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset', 'datasetClone', 'remoteServices']),
    ...mapGetters('dataset', ['can', 'remoteServicesMap']),
    datasetConcepts () {
      return new Set(this.dataset.schema.map(field => field['x-refersTo']).filter(c => c))
    },
    availableExtensions () {
      if (!this.remoteServices) return
      if (!this.localExtensions) return
      const extensions = []
      this.remoteServices.forEach(service => {
        service.actions.filter(a => a.inputCollection && a.outputCollection).forEach(a => {
          a.output = a.output.filter(f => f.title)
          const extension = { id: service.id + '--' + a.id, remoteService: service.id, action: a }
          if (this.localExtensions.find(e => extension.id === e.remoteService + '--' + e.action)) {
            extension.disabled = this.$t('extensionExists')
          }
          if (!extension.action.input.find(i => this.datasetConcepts.has(i.concept))) {
            const missingConcepts = extension.action.input.filter(i => i.concept !== 'http://schema.org/identifier').map(i => this.vocabulary[i.concept] ? this.vocabulary[i.concept].title : 'concept déprécié')
            extension.disabled = this.$t('missingConcepts', { concepts: missingConcepts.join(', ') })
          }
          if (this.newExtension === extension) extension.color = 'primary'
          if (this.localExtensions.find(e => extension.id === e.remoteService + '--' + e.action)) extension.color = 'green'
          if (!extension.action.input.find(i => this.datasetConcepts.has(i.concept))) extension.color = 'error'
          extensions.push(extension)
        })
      })
      return extensions
    },
    selectFields () {
      const res = {};
      (this.localExtensions || []).forEach(extension => {
        if (!this.remoteServicesMap[extension.remoteService] || !this.remoteServicesMap[extension.remoteService].actions[extension.action]) {
          return
        }
        const fields = this.remoteServicesMap[extension.remoteService].actions[extension.action].output
          .map(field => { field['x-tags'] = field['x-tags'] || []; return field })
          .filter(f => !f.concept || f.concept !== 'http://schema.org/identifier')
          .filter(f => f.name !== 'error')
          .filter(f => f.name !== '_error')
          .filter(f => !f['x-calculated'])
          .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
        const tags = [...new Set([].concat(...fields.map(f => f['x-tags'])))].sort()
        const fieldsAndTags = []
        tags.forEach(tag => {
          fieldsAndTags.push({ header: tag })
          fields.filter(field => field['x-tags'].includes(tag)).forEach(field => fieldsAndTags.push(field))
        })
        const noTagsFields = fields.filter(field => !field['x-tags'] || field['x-tags'].length === 0)
        if (fieldsAndTags.length > 0 && noTagsFields.length > 0) {
          fieldsAndTags.push({ header: 'Autres' })
        }
        noTagsFields.forEach(field => fieldsAndTags.push(field))
        res[extension.remoteService + '_' + extension.action] = { fields, tags, fieldsAndTags }
      })
      return res
    }
  },
  async created () {
    await this.fetchRemoteServices()
    logger.debug('remoteServicesMap after fetchRemoteServices', this.remoteServicesMap)

    // we do not use "active" anymore, just ignore inactive extensions
    this.dataset.extensions = (this.dataset.extensions || []).filter(e => e.active !== false)
    // remove deprecated extensions based on available extensions
    this.dataset.extensions = this.dataset.extensions.filter(e => {
      return this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action]
    })
    this.localExtensions = JSON.parse(JSON.stringify(this.dataset.extensions))

    // TODO: remove deprecated extensions based on available extensions
    /* const nbExtensions = this.localExtensions.length
      this.localExtensions = this.localExtensions.filter(e => {
        return this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action]
      })
      if (nbExtensions !== this.localExtensions.length) {
        this.patch({ extensions: this.localExtensions, silent: true })
      }
      logger.debug('localExtensions after fetchRemoteServices', this.localExtensions) */
    this.ready = true
  },
  methods: {
    ...mapActions('dataset', ['fetchRemoteServices', 'patch']),
    hasChanges (extension) {
      const savedExtension = this.dataset.extensions.find(e => e.remoteService === extension.remoteService && e.action === extension.action)
      return !savedExtension || JSON.stringify(savedExtension.select) !== JSON.stringify(extension.select)
    },
    clickExtension (extension) {
      if (extension.disabled) return
      if (this.newExtension) this.newExtension = null
      else {
        this.newExtension = extension
        this.selectedFields = [...this.defaultFields[extension.action.id]]
        extension.action.output.sort((a, b) => {
          if (this.selectedFields.includes(a.name) && !this.selectedFields.includes(b.name)) return -1
          if (this.selectedFields.includes(b.name) && !this.selectedFields.includes(a.name)) return 1
          return 0
        })
      }
    },
    removeExtension (idx) {
      const extension = this.localExtensions[idx]
      this.localExtensions.splice(idx, 1)
      const savedIdx = this.dataset.extensions.findIndex(e => e.remoteService === extension.remoteService && e.action === extension.action)
      if (savedIdx !== -1) this.dataset.extensions.splice(savedIdx, 1)
      this.patch({ extensions: this.dataset.extensions })
    },
    applyExtension (idx) {
      const extension = JSON.parse(JSON.stringify(this.localExtensions[idx]))
      const savedIdx = this.dataset.extensions.findIndex(e => e.remoteService === extension.remoteService && e.action === extension.action)
      if (savedIdx === -1) this.dataset.extensions.push(extension)
      else this.dataset.extensions[savedIdx] = extension
      this.patch({ extensions: this.dataset.extensions })
    }
  }
}
</script>
