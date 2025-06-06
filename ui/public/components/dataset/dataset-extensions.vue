<template lang="html">
  <v-row>
    <v-col class="my-4">
      <!-- 450 matches the size of the container in the embed page, to prevent overflowing iframe -->
      <v-row>
        <v-col>
          <v-menu
            v-model="addExtensionDialog"
            :max-height="450"
          >
            <template #activator="{ on }">
              <v-btn
                v-if="can('writeDescriptionBreaking')"
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
                    type: extension.type,
                    remoteService: extension.remoteService,
                    action: extension.action.id,
                    select: defaultFields[extension.action.id] || [],
                    overwrite: {}
                  })"
                >
                  <v-list-item-content>
                    <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
                    <v-list-item-subtitle>{{ extension.linkInfo }}</v-list-item-subtitle>
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

          <br>

          <v-btn
            v-if="can('writeDescriptionBreaking')"
            color="primary"
            class="mt-2"
            @click="addPropertyDialog = true"
          >
            {{ $t('addExprEvalExtension') }}
          </v-btn>

          <dataset-add-property-dialog
            v-model="addPropertyDialog"
            :schema="dataset.schema"
            @add="property => localExtensions.push({
              active: true,
              type: 'exprEval',
              expr: '',
              property
            })"
          />
        </v-col>
      </v-row>
      <v-form v-model="valid">
        <v-row
          v-if="localExtensions"
          class="mt-0"
        >
          <v-col
            v-for="(extension, idx) in localExtensions"
            :key="idx"
            cols="12"
            md="6"
          >
            <v-card
              :loading="!ready"
              height="100%"
              :outlined="!extensionHasChanges(extension)"
            >
              <template v-if="extension.type === 'remoteService'">
                <template v-if="remoteServicesMap[extension.remoteService]?.actions[extension.action]">
                  <v-card-title>
                    {{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }}
                  </v-card-title>
                  <v-card-text style="margin-bottom:40px;">
                    Lien : {{ extensionLinkInfo(extension) }}
                    <v-autocomplete
                      v-if="selectFields[extension.remoteService + '_' + extension.action]?.fieldsAndTags"
                      v-model="extension.select"
                      :disabled="!can('writeDescriptionBreaking')"
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
                    <v-btn
                      text
                      @click="showOverwrite = showOverwrite === idx ? null : idx"
                    >
                      Surcharger les clés des colonnes <v-icon v-if="showOverwrite === idx">mdi-menu-up</v-icon><v-icon v-else>mdi-menu-down</v-icon>
                    </v-btn>
                    <div v-show="showOverwrite === idx">
                      <div
                        v-for="propKey of extension.select?.length ? extension.select : selectFields[extension.remoteService + '_' + extension.action].fieldsAndTags.map(p => p.name)"
                        :key="propKey"
                      >
                        <v-text-field
                          :label="propKey"
                          :value="extension.overwrite?.[propKey]?.['x-originalName']"
                          :placeholder="extension.propertyPrefix + '.' + propKey"
                          :rules="[v => validPropertyOverwrite(extension, propKey, v) || '']"
                          validate-on="eager"
                          @input="val => setOverwriteOriginalName(extension, propKey, val)"
                        />
                      </div>
                    </div>
                    <v-checkbox
                      v-if="extension.remoteService.startsWith('dataset:') && dataset.isRest"
                      v-model="extension.autoUpdate"
                      :label="$t('autoUpdate')"
                      :messages="extension.nextUpdate"
                    >
                      <template #message>
                        {{ $t('nextUpdate') }} {{ extension.nextUpdate | moment("from", "now") }}
                      </template>
                    </v-checkbox>
                  </v-card-text>
                  <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
                    <confirm-menu
                      v-if="can('writeDescriptionBreaking') && dataset.isRest"
                      yes-color="primary"
                      icon="mdi-refresh"
                      :btn-props="{color: 'primary', icon: true}"
                      :text="$t('confirmRefreshText')"
                      :tooltip="$t('confirmRefreshTooltip')"
                      @confirm="updateExtension(idx)"
                    />
                    <dataset-extension-details-dialog
                      :extension="extension"
                      :disabled="extensionHasChanges(extension)"
                    />
                    <confirm-menu
                      v-if="can('writeDescriptionBreaking')"
                      yes-color="warning"
                      :text="$t('confirmDeleteText')"
                      :tooltip="$t('confirmDeleteTooltip')"
                      @confirm="removeExtension(idx)"
                    />
                  </v-card-actions>
                </template>
                <template v-else>
                  <v-card-text style="margin-bottom:40px;">
                    <v-alert
                      outlined
                      type="warning"
                    >
                      Donnée de référence non disponible ({{ extension.remoteService }} / {{ extension?.action?.replace('masterData_bulkSearch_', '') }}).
                      <br>
                      Soit la donnée de référence n'existe plus, soit le concept servant de liaison n'est plus présent dans votre jeu de données.
                    </v-alert>
                  </v-card-text>
                  <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
                    <confirm-menu
                      v-if="can('writeDescriptionBreaking')"
                      yes-color="warning"
                      :text="$t('confirmDeleteText')"
                      :tooltip="$t('confirmDeleteTooltip')"
                      @confirm="removeExtension(idx)"
                    />
                  </v-card-actions>
                </template>
              </template>
              <template v-if="extension.type === 'exprEval'">
                <v-card-title>
                  {{ extension.property?.['x-originalName'] || $t('newExprEval') }}
                </v-card-title>
                <v-card-text style="margin-bottom:40px;">
                  <v-text-field
                    v-model="extension.expr"
                    disabled
                    :label="$t('expr')"
                    hide-details
                  >
                    <template #append>
                      <dataset-extension-expr-eval-preview-dialog
                        v-if="can('writeDescriptionBreaking')"
                        :extension="extension"
                      />
                    </template>
                  </v-text-field>
                </v-card-text>
                <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
                  <confirm-menu
                    v-if="can('writeDescriptionBreaking')"
                    yes-color="warning"
                    :text="$t('confirmDeleteText')"
                    :tooltip="$t('confirmDeleteTooltip')"
                    @confirm="removeExtension(idx)"
                  />
                </v-card-actions>
              </template>
            </v-card>
          </v-col>
        </v-row>
      </v-form>

      <v-row class="px-2">
        <v-spacer />
        <v-btn
          v-t="'apply'"
          color="primary"
          depressed
          :disabled="!hasChanges || !valid"
          @click="applyExtensions()"
        />
      </v-row>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  addExtension: Ajouter des colonnes de données de référence
  addExprEvalExtension: Ajouter une colonne calculée
  additionalCols: Colonnes additionnelles
  allColsOut: Toutes les colonnes
  confirmDeleteTooltip: Supprimer l'extension
  confirmDeleteText: Souhaitez-vous confirmer la suppression ?
  confirmRefreshTooltip: Relancer l'enrichissement
  confirmRefreshText: Souhaitez-vous confirmer la relance de l'enrichissement ?
  apply: Appliquer
  extensionExists: Cette extension a déjà été configurée
  missingConcepts: "Il faut associer au moins l'un des concepts suivants à vos colonnes : {concepts}"
  missingConcept: "Il faut associer le concept suivant à une de vos colonnes : ${concept}"
  newExprEval: Nouvelle colonne calculée
  expr: Expression
  autoUpdate: mise à jour automatique si la source change
  nextUpdate: mise à jour planifiée pour
en:
  addExtension: Add columns from master-data sources
  addExprEvalExtension: Add a calculated column
  additionalCols: Additional columns
  allColsOut: All the columns
  confirmDeleteTooltip: Delete the extension
  confirmDeleteText: Do you want to confirm the deletion ?
  confirmRefreshTooltip: Update extension
  confirmRefreshText: Do you want to confirm the update of the extension ?
  apply: Apply
  extensionExists: This extension was already configured
  missingConcepts: "You must tag your columns with at least one of these concepts: {concepts}"
  missingConcept: "You must tag one of your columns with this concept: ${concept}"
  newExprEval: New calculated column
  expr: Expression
  autoUpdate: auto update when the source changes
  nextUpdate: next update planned for
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import logger from '~/logger'
import { escapeKey } from '../../assets/dataset-utils'

export default {
  data () {
    return {
      ready: false,
      addExtensionDialog: false,
      addPropertyDialog: false,
      newExtension: null,
      localExtensions: null,
      defaultFields: {
        findEntreprisesBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFEN'],
        findEtablissementsBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFET'],
        postCoords: ['lat', 'lon'],
        findCityBulk: ['population.popMuni', 'DEP', 'REG'],
        findParcellesBulk: ['lat', 'lon']
      },
      showOverwrite: null,
      valid: false
    }
  },
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('session', ['user']),
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
          const extension = { type: 'remoteService', id: service.id + '--' + a.id, remoteService: service.id, action: a }
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
          if (!extension.disabled) extension.linkInfo = 'Lien possible : ' + this.extensionLinkInfo(extension)
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
    },
    hasChanges () {
      return JSON.stringify(this.dataset.extensions) !== JSON.stringify(this.localExtensions)
    }
  },
  async created () {
    await this.fetchRemoteServices()
    logger.debug('remoteServicesMap after fetchRemoteServices', this.remoteServicesMap)

    // we do not use "active" anymore, just ignore inactive extensions
    this.dataset.extensions = (this.dataset.extensions || []).filter(e => e.active !== false)
    // remove deprecated extensions based on available extensions
    /* this.dataset.extensions = this.dataset.extensions.filter(e => {
      return e.type !== 'remoteService' || (this.remoteServicesMap[e.remoteService] && this.remoteServicesMap[e.remoteService].actions[e.action])
    }) */
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
    ...mapActions('dataset', ['fetchRemoteServices', 'patchAndCommit']),
    extensionHasChanges (extension) {
      let savedExtension
      if (extension.type === 'remoteService') {
        savedExtension = this.dataset.extensions.find(e => e.remoteService === extension.remoteService && e.action === extension.action)
      } else {
        savedExtension = this.dataset.extensions.find(e => e.property?.['x-originalName'] === extension.property?.['x-originalName'])
      }
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
      this.localExtensions.splice(idx, 1)
    },
    updateExtension (idx) {
      this.localExtensions[idx].needsUpdate = true
      this.patchAndCommit({ extensions: JSON.parse(JSON.stringify(this.localExtensions)) })
    },
    applyExtensions () {
      this.patchAndCommit({ extensions: JSON.parse(JSON.stringify(this.localExtensions)) })
    },
    extensionLinkInfo (extension) {
      const input = this.remoteServicesMap[extension.remoteService].actions[extension.action?.id ?? extension.action].input.filter(i => i.concept !== 'http://schema.org/identifier')
      return input.map(i => {
        const concept = this.vocabulary[i.concept]?.title || i.concept
        const field = this.dataset.schema.find(f => f['x-refersTo'] === i.concept)
        const fieldTitle = field && (field.title || field['x-originalName'] || field.key)
        let msg = `concept ${concept}`
        if (fieldTitle) msg += ` (colonne ${fieldTitle})`
        return msg
      }).join(', ')
    },
    validPropertyOverwrite (extension, name, newName) {
      newName = newName?.trim()
      if (!newName) return true
      const key = escapeKey(newName)
      return !this.dataset.schema.some(f => {
        if (f['x-extension'] === extension.remoteService + '/' + extension.action) {
          if (extension.select?.includes(newName) && name !== newName) return true
          if (extension.overwrite) {
            for (const [overwriteKey, overwriteValue] of Object.entries(extension.overwrite)) {
              if (overwriteKey !== name && overwriteValue['x-originalName']?.trim() && escapeKey(overwriteValue['x-originalName'].trim()) === key) {
                return true
              }
            }
          }
          return false
        } else {
          return f.key === key
        }
      })
    },
    setOverwriteOriginalName (extension, propKey, value) {
      if (value) value = value.trim()
      if (value) {
        if (!extension.overwrite) this.$set(extension, 'overwrite', {})
        if (!extension.overwrite[propKey]) this.$set(extension.overwrite, propKey, {})
        this.$set(extension.overwrite[propKey], 'x-originalName', value)
      } else {
        this.$delete(extension.overwrite[propKey], 'x-originalName')
      }
    }
  }
}
</script>
