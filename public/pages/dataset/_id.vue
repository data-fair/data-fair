<template>
  <v-row
    v-if="dataset"
    class="my-0"
  >
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row class="dataset">
          <v-col>
            <dataset-status />

            <layout-section-tabs
              :min-height="180"
              :svg="buildingSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'structure')"
            >
              <template #tabs>
                <v-tab href="#structure-schema">
                  <v-icon>mdi-table-cog</v-icon>&nbsp;&nbsp;{{ $t('schema') }}
                </v-tab>

                <template v-if="can('writeDescription') && dataset.isVirtual">
                  <v-tab href="#structure-virtual">
                    <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>&nbsp;&nbsp;{{ $t('virtual') }}
                  </v-tab>
                </template>

                <v-tab
                  v-if="!env.disableRemoteServices"
                  href="#structure-extensions"
                >
                  <v-icon>mdi-merge</v-icon>&nbsp;&nbsp;{{ $t('extension') }}
                </v-tab>

                <v-tab
                  v-if="user.adminMode && !dataset.draftReason"
                  href="#structure-masterdata"
                  class="admin--text"
                >
                  <v-icon color="admin">
                    mdi-star-four-points
                  </v-icon>&nbsp;&nbsp;{{ $t('masterData') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="structure-schema">
                  <v-container fluid>
                    <tutorial-alert id="dataset-add-concepts">
                      {{ $t('tutorialConcepts') }}
                    </tutorial-alert>
                    <dataset-schema />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="structure-virtual">
                  <v-container fluid>
                    <dataset-virtual />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="structure-extensions">
                  <layout-doc-link
                    :tooltip="$t('docLinkExtend')"
                    doc-key="datasetExtend"
                  />
                  <v-container fluid>
                    <dataset-extensions />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="structure-masterdata">
                  <dataset-master-data />
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :min-height="390"
              :svg="checklistSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'metadata')"
            >
              <template #tabs>
                <v-tab href="#metadata-info">
                  <v-icon>mdi-information</v-icon>&nbsp;&nbsp;{{ $t('info') }}
                </v-tab>

                <v-tab
                  v-if="!dataset.draftReason"
                  href="#metadata-attachments"
                >
                  <v-icon>mdi-attachment</v-icon>&nbsp;&nbsp;{{ $t('attachments') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="metadata-info">
                  <layout-doc-link
                    :tooltip="$t('docLinkEdit')"
                    doc-key="datasetEdit"
                  />
                  <v-container
                    fluid
                    class="py-0"
                  >
                    <tutorial-alert id="dataset-configure-meta">
                      {{ $t('tutorialConfigMeta') }}
                    </tutorial-alert>
                    <dataset-info />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="metadata-attachments">
                  <layout-doc-link
                    :tooltip="$t('docLinkAttachments')"
                    doc-key="datasetAttachments"
                  />
                  <dataset-attachments />
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :svg="dataSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'data')"
            >
              <template
                #title
                v-t="'data'"
              />
              <template #tabs>
                <v-tab href="#data-table">
                  <v-icon>mdi-table</v-icon>&nbsp;&nbsp;{{ $t('table') }}
                </v-tab>

                <v-tab
                  v-if="dataset.rest && dataset.rest.history"
                  href="#data-revisions"
                >
                  <v-icon>mdi-history</v-icon>&nbsp;&nbsp;{{ $t('revisions') }}
                </v-tab>

                <v-tab
                  v-if="dataset.bbox && !env.disableRemoteServices"
                  href="#data-map"
                >
                  <v-icon>mdi-map</v-icon>&nbsp;&nbsp;{{ $t('map') }}
                </v-tab>

                <v-tab
                  v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))"
                  href="#data-calendar"
                >
                  <v-icon>mdi-calendar-range</v-icon>&nbsp;&nbsp;{{ $t('calendar') }}
                </v-tab>

                <v-tab
                  v-if="fileProperty && (!fileProperty['x-capabilities'] || fileProperty['x-capabilities'].indexAttachment !== false)"
                  href="#data-files"
                >
                  <v-icon>mdi-content-copy</v-icon>&nbsp;&nbsp;{{ $t('files') }}
                </v-tab>

                <v-tab
                  v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')"
                  href="#data-thumbnails"
                >
                  <v-icon>mdi-image</v-icon>&nbsp;&nbsp;{{ $t('thumbnails') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="data-table">
                  <dataset-table />
                </v-tab-item>

                <v-tab-item value="data-revisions">
                  <v-list-item v-if="dataset.isRest && dataset.rest.history">
                    <v-list-item-avatar class="ml-0 my-0">
                      <v-icon
                        :disabled="!dataset.rest.historyTTL.active"
                        color="warning"
                      >
                        mdi-delete-restore
                      </v-icon>
                    </v-list-item-avatar>
                    <span
                      v-if="dataset.rest.historyTTL.active"
                      v-t="{path: 'historyTTL', args: {days: dataset.rest.historyTTL.delay.value}}"
                    />
                    <span
                      v-else
                      v-t="'noHistoryTTL'"
                    />
                    <dataset-edit-ttl
                      v-if="can('writeDescription')"
                      :ttl="dataset.rest.historyTTL"
                      :schema="dataset.schema"
                      :revisions="true"
                      @change="ttl => {dataset.rest.historyTTL = ttl; patch({rest: dataset.rest})}"
                    />
                  </v-list-item>
                  <dataset-history />
                </v-tab-item>

                <v-tab-item value="data-map">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <dataset-map
                      v-if="dataset.bbox"
                      fixed-height="600"
                    />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="data-calendar">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <dataset-calendar />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="data-files">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <dataset-search-files />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="data-thumbnails">
                  <v-container fluid>
                    <dataset-thumbnails-opts v-if="can('writeDescription')" />
                    <dataset-thumbnails />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :section="sections.find(s => s.id === 'reuses')"
              :svg="chartSvg"
              svg-no-margin
              :min-height="140"
            >
              <template
                #title
                v-t="'uses'"
              />
              <template #tabs>
                <v-tab href="#reuses-apps">
                  <v-icon>mdi-image-multiple</v-icon>&nbsp;&nbsp;{{ $t('visualizations') }}
                </v-tab>

                <v-tab href="#reuses-external">
                  <v-icon>mdi-open-in-new</v-icon>&nbsp;&nbsp;{{ $t('extReuses') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="reuses-apps">
                  <dataset-applications />
                </v-tab-item>

                <v-tab-item value="reuses-external">
                  <dataset-external-reuses />
                </v-tab-item>
              </template>
            </layout-section-tabs>
            <layout-section-tabs
              :section="sections.find(s => s.id === 'share')"
              :svg="shareSvg"
              svg-no-margin
              :min-height="200"
            >
              <template
                #title
                v-t="'share'"
              />
              <template #tabs>
                <v-tab
                  v-if="can('getPermissions')"
                  href="#share-permissions"
                >
                  <v-icon>mdi-security</v-icon>&nbsp;&nbsp;{{ $t('permissions') }}
                </v-tab>

                <v-tab href="#share-publication-sites">
                  <v-icon>mdi-presentation</v-icon>&nbsp;&nbsp;{{ $t('portals') }}
                </v-tab>

                <v-tab href="#share-publications">
                  <v-icon>mdi-transit-connection</v-icon>&nbsp;&nbsp;{{ $t('catalogs') }}
                </v-tab>

                <v-tab
                  v-if="dataset.isRest"
                  href="#share-exports"
                >
                  <v-icon>mdi-export</v-icon>&nbsp;&nbsp;{{ $t('exports') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="share-permissions">
                  <tutorial-alert
                    id="dataset-share-portal"
                    class="mx-2"
                  >
                    {{ $t('tutorialShare') }}
                  </tutorial-alert>
                  <v-container fluid>
                    <permissions
                      v-if="can('getPermissions')"
                      :resource="dataset"
                      :resource-url="resourceUrl"
                      :api="api"
                      :has-public-deps="hasPublicApplications"
                    />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="share-publication-sites">
                  <tutorial-alert
                    id="dataset-share-portal"
                    class="mx-2"
                  >
                    {{ $t('tutorialShare') }}
                  </tutorial-alert>
                  <dataset-publication-sites :publication-sites="publicationSites" />
                </v-tab-item>

                <v-tab-item value="share-publications">
                  <dataset-catalog-publications />
                </v-tab-item>

                <v-tab-item value="share-exports">
                  <dataset-exports />
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :section="sections.find(s => s.id === 'activity')"
              :svg="settingsSvg"
              :min-height="550"
            >
              <template
                #title
                v-t="'activity'"
              />
              <template #tabs>
                <v-tab
                  v-if="can('readJournal')"
                  href="#activity-journal"
                >
                  <v-icon>mdi-calendar-text</v-icon>&nbsp;&nbsp;{{ $t('journal') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="activity-journal">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <journal
                      :journal="journal"
                      type="dataset"
                    />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>
          </v-col>
        </v-row>
      </v-container>
    </v-col>

    <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
      <dataset-actions :publication-sites="publicationSites" />
      <layout-toc :sections="sections">
        <template #title="{section}">
          {{ section.id === 'activity' && taskProgress ? ($t('activity') + ' - ' + $t('tasks.' + taskProgress.task)) : section.title }}
        </template>
        <template #bottom="{section}">
          <v-progress-linear
            v-if="section.id === 'activity' && taskProgress"
            :value="taskProgress.progress"
            :indeterminate="taskProgress.progress === undefined"
            absolute
            bottom
          />
        </template>
      </layout-toc>
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template #actions>
        <dataset-actions :publication-sites="publicationSites" />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  schema: Schéma
  extension: Enrichissement
  virtual: Jeu virtuel
  masterData: Données de référence
  tutorialConcepts: Pensez à renseigner des concepts sur les colonnes. Ces concepts seront utilisés pour proposer des visualisations de données adaptées et des possibilités d'enrichissement.
  docLinkExtend: Consultez la documentation sur l'extension de jeux de données
  info: Informations
  attachments: Pièces jointes
  docLinkEdit: Consultez la documentation sur l'édition de jeux de données
  tutorialConfigMeta: Vous pouvez configurer des licences et des thématiques dans les paramètres.
  docLinkAttachments: Consultez la documentation sur les pièces jointes des jeux de données
  data: Données
  table: Tableau
  revisions: Révisions
  map: Carte
  calendar: Calendrier
  files: Fichiers
  thumbnails: Vignettes
  exports: Exports
  visualizations: Visualisations
  extReuses: Réutilisations externes
  share: Partage
  permissions: Permissions
  portals: Portails
  catalogs: Catalogues
  tutorialShare: Configurez des portails pour mieux partager vos données au public ou en interne.
  activity: Activité
  journal: Journal
  structure: Structure
  metadata: Métadonnées
  uses: Utilisations
  datasets: jeux de données
  historyTTL: Supprimer automatiquement les révisions de lignes qui datent de plus de {days} jours.
  noHistoryTTL: pas de politique d'expiration des révisions configurée
  tasks:
    index: indexation
    extend: extensions
    analyze: analyse
    finalize: finalisation
    convert: conversion
en:
  schema: Schema
  extension: Extension
  virtual: Virtual dataset
  masterData: Master-data
  tutorialConcepts: You should assign concepts to your columns. They will be used to help you configure visualizations and data extensions.
  docLinkExtend: Read the documentation about extending datasets
  info: Information
  attachments: Attachments
  docLinkEdit: Read the documentation about editing datasets
  tutorialConfigMeta: You can configure licences and topics in the parameters.
  docLinkAttachments: Read the documentation about dataset attachments
  data: Data
  table: Table
  revisions: Revisions
  map: Map
  calendar: Calendar
  files: Files
  thumbnails: Thumbnails
  visualizations: Visualizations
  extReuses: External reuses
  share: Share
  permissions: Permissions
  portals: Portals
  catalogs: Catalogs
  tutorialShare: Configure portals to better publish your data privately or publicly.
  activity: Activity
  journal: Journal
  structure: Structure
  metadata: Metadata
  uses: Uses
  datasets: datasets
  historyTTL: Automatically delete revisions more than {days} days old.
  noHistoryTTL: no automatic expiration of revisions configured
  tasks:
    index: indexing
    extend: extensions
    analyze: analysis
    finalize: finalization
    convert: conversion
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    settingsSvg: require('~/assets/svg/Settings_Monochromatic.svg?raw'),
    dataSvg: require('~/assets/svg/Data storage_Two Color.svg?raw'),
    chartSvg: require('~/assets/svg/Graphics and charts_Two Color.svg?raw'),
    shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
    checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
    buildingSvg: require('~/assets/svg/Team building _Two Color.svg?raw')
  }),
  async fetch ({ store, route }) {
    store.dispatch('dataset/clear')
    await Promise.all([
      store.dispatch('dataset/setId', { datasetId: route.params.id, draftMode: true }),
      store.dispatch('fetchVocabulary')
    ])
    if (store.state.dataset.dataset) {
      await store.dispatch('fetchPublicationSites', store.state.dataset.dataset.owner)
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset', 'api', 'journal', 'taskProgress']),
    ...mapGetters('dataset', ['resourceUrl', 'can', 'hasPublicApplications']),
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    publicationSites () {
      if (!this.dataset) return []
      return this.$store.getters.ownerPublicationSites(this.dataset.owner)
    },
    fileProperty () {
      if (!this.dataset) return
      return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    },
    sections () {
      const sections = []
      if (!this.dataset) return sections
      if (this.dataset.finalizedAt) {
        sections.push({ title: this.$t('structure'), id: 'structure' })
      }
      if (this.dataset.finalizedAt || this.dataset.isMetaOnly) {
        sections.push({ title: this.$t('metadata'), id: 'metadata' })
      }
      if (this.can('readLines') && this.dataset.finalizedAt) {
        sections.push({ title: this.$t('data'), id: 'data' })
      }
      if (this.dataset.finalizedAt && !this.dataset.draftReason && !this.env.disableApplications) {
        sections.push({ title: this.$t('uses'), id: 'reuses' })
      }
      if ((this.dataset.finalizedAt || this.dataset.isMetaOnly) && !this.dataset.draftReason && !this.env.disableSharing) {
        sections.push({ title: this.$t('share'), id: 'share' })
      }
      if (this.can('readJournal') && !this.dataset.isMetaOnly) {
        sections.push({ title: this.$t('activity'), id: 'activity' })
      }
      return sections
    }
  },
  created () {
    // children pages are deprecated
    const path = `/dataset/${this.$route.params.id}`
    if (this.$route.path !== path) return this.$router.push(path)
    if (this.dataset) {
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('datasets'), to: '/datasets' }, { text: this.dataset.title || this.dataset.id }])
      this.subscribe()
    }
  },
  methods: {
    ...mapActions('dataset', ['subscribe', 'patch'])
  }
}
</script>

<style>
.dataset .v-tab {
  font-weight: bold;
}
</style>
