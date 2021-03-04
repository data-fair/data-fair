<template>
  <v-row v-if="dataset || error">
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-alert
          v-if="error"
          type="error"
          outlined
        >
          {{ error.data }}
        </v-alert>
        <template v-else>
          <v-row class="dataset">
            <v-col>
              <dataset-status />

              <section-tabs
                :min-height="220"
                :svg="buildingSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'structure')"
              >
                <template v-slot:tabs>
                  <v-tab href="#structure-schema">
                    <v-icon>mdi-table-cog</v-icon>&nbsp;&nbsp;Schéma
                  </v-tab>

                  <template v-if="can('writeDescription') && dataset.isVirtual">
                    <v-tab href="#structure-virtual">
                      <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>&nbsp;&nbsp;Jeu virtuel
                    </v-tab>
                  </template>

                  <v-tab href="#structure-extensions">
                    <v-icon>mdi-merge</v-icon>&nbsp;&nbsp;Enrichissement
                  </v-tab>

                  <v-tab
                    v-if="user.adminMode"
                    href="#structure-masterdata"
                    class="admin--text"
                  >
                    <v-icon color="admin">
                      mdi-star-four-points
                    </v-icon>&nbsp;&nbsp;Données de référence
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="structure-schema">
                    <v-container fluid class="pb-0">
                      <dataset-schema />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="structure-virtual">
                    <v-container fluid>
                      <dataset-virtual />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="structure-extensions">
                    <doc-link tooltip="Consultez la documentation sur l'extension de jeux de données" doc-key="datasetExtend" />
                    <v-container fluid class="pt-0">
                      <dataset-extensions />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="structure-masterdata">
                    <dataset-master-data />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                :min-height="390"
                :svg="checklistSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'metadata')"
              >
                <template v-slot:tabs>
                  <v-tab href="#metadata-info">
                    <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
                  </v-tab>

                  <v-tab href="#metadata-attachments">
                    <v-icon>mdi-attachment</v-icon>&nbsp;&nbsp;Pièces jointes
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="metadata-info">
                    <doc-link tooltip="Consultez la documentation sur l'édition de jeux de données" doc-key="datasetEdit" />
                    <v-container fluid class="pb-0">
                      <dataset-info />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="metadata-attachments">
                    <doc-link tooltip="Consultez la documentation sur les pièces jointes des jeux de données" doc-key="datasetAttachments" />
                    <dataset-attachments />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                :svg="dataSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'data')"
              >
                <template v-slot:title>
                  Données
                </template>
                <template v-slot:tabs>
                  <v-tab href="#data-table">
                    <v-icon>mdi-table</v-icon>&nbsp;&nbsp;Tableau
                  </v-tab>

                  <v-tab v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))" href="#data-calendar">
                    <v-icon>mdi-calendar-range</v-icon>&nbsp;&nbsp;Calendrier
                  </v-tab>

                  <v-tab v-if="dataset.bbox" href="#data-map">
                    <v-icon>mdi-map</v-icon>&nbsp;&nbsp;Carte
                  </v-tab>

                  <v-tab v-if="fileProperty" href="#data-files">
                    <v-icon>mdi-content-copy</v-icon>&nbsp;&nbsp;Fichiers
                  </v-tab>

                  <v-tab v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')" href="#data-thumbnails">
                    <v-icon>mdi-image</v-icon>&nbsp;&nbsp;Vignettes
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="data-table">
                    <dataset-table />
                  </v-tab-item>

                  <v-tab-item value="data-calendar">
                    <v-container fluid class="pa-0">
                      <dataset-calendar />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="data-map">
                    <v-container fluid class="pa-0">
                      <dataset-map fixed-height="600" />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="data-files">
                    <v-container fluid class="pa-0">
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
              </section-tabs>

              <section-tabs
                :section="sections.find(s => s.id === 'reuses')"
                :svg="chartSvg"
                svg-no-margin
                :min-height="140"
              >
                <template v-slot:title>
                  Utilisations
                </template>
                <template v-slot:tabs>
                  <v-tab href="#reuses-apps">
                    <v-icon>mdi-image-multiple</v-icon>&nbsp;&nbsp;Visualisations
                  </v-tab>

                  <v-tab href="#reuses-external">
                    <v-icon>mdi-open-in-new</v-icon>&nbsp;&nbsp;Réutilisations externes
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="reuses-apps">
                    <dataset-applications />
                  </v-tab-item>

                  <v-tab-item value="reuses-external">
                    <dataset-external-reuses />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                :section="sections.find(s => s.id === 'share')"
                :svg="shareSvg"
                svg-no-margin
                :min-height="200"
              >
                <template v-slot:title>
                  Partage
                </template>
                <template v-slot:tabs>
                  <v-tab href="#share-permissions">
                    <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Permissions
                  </v-tab>

                  <v-tab href="#share-publications">
                    <v-icon>mdi-publish</v-icon>&nbsp;&nbsp;Publications
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="share-permissions">
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

                  <v-tab-item value="share-publications">
                    <dataset-publications />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                :section="sections.find(s => s.id === 'activity')"
                :svg="settingsSvg"
                :min-height="550"
              >
                <template v-slot:title>
                  Activité
                </template>
                <template v-slot:tabs>
                  <v-tab v-if="can('readJournal')" href="#activity-journal">
                    <v-icon>mdi-calendar-text</v-icon>&nbsp;&nbsp;Journal
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="activity-journal">
                    <v-container fluid class="pa-0">
                      <journal
                        :journal="journal"
                        type="dataset"
                      />
                    </v-container>
                  </v-tab-item>
                </template>
              </section-tabs>
            </v-col>
          </v-row>
        </template>
      </v-container>
    </v-col>

    <navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <dataset-actions />
      <toc :sections="sections" />
    </navigation-right>
    <actions-button v-else>
      <template v-slot:actions>
        <dataset-actions />
      </template>
    </actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import DatasetInfo from '~/components/datasets/info.vue'
  import DatasetSchema from '~/components/datasets/schema.vue'
  import DatasetActions from '~/components/datasets/actions.vue'
  import DatasetExtensions from '~/components/datasets/extensions.vue'
  import DatasetAttachments from '~/components/datasets/attachments.vue'
  import DatasetTable from '~/components/datasets/table.vue'
  import DatasetCalendar from '~/components/datasets/calendar.vue'
  import DatasetMap from '~/components/datasets/map.vue'
  import DatasetVirtual from '~/components/datasets/virtual.vue'
  import DatasetSearchFiles from '~/components/datasets/search-files.vue'
  import DatasetThumbnails from '~/components/datasets/thumbnails.vue'
  import DatasetThumbnailsOpts from '~/components/datasets/thumbnails-opts.vue'
  import DatasetPublications from '~/components/datasets/publications.vue'
  import DatasetStatus from '~/components/datasets/status.vue'
  import DatasetApplications from '~/components/datasets/applications.vue'
  import DatasetExternalReuses from '~/components/datasets/external-reuses.vue'
  import DatasetMasterData from '~/components/datasets/master-data.vue'
  import Permissions from '~/components/permissions.vue'
  import Journal from '~/components/journal.vue'
  import SectionTabs from '~/components/layout/section-tabs.vue'
  import NavigationRight from '~/components/layout/navigation-right'
  import ActionsButton from '~/components/layout/actions-button'
  import Toc from '~/components/layout/toc.vue'

  const settingsSvg = require('~/assets/svg/Settings_Monochromatic.svg?raw')
  const dataSvg = require('~/assets/svg/Data storage_Two Color.svg?raw')
  // const chartSvg = require('~/assets/svg/Graphics and charts_Monochromatic.svg?raw')
  const chartSvg = require('~/assets/svg/Graphics and charts_Two Color.svg?raw')
  // const shareSvg = require('~/assets/svg/Share_Monochromatic.svg?raw')
  const shareSvg = require('~/assets/svg/Share_Two Color.svg?raw')
  // const checklistSvg = require('~/assets/svg/Checklist _Monochromatic.svg?raw')
  const checklistSvg = require('~/assets/svg/Checklist_Two Color.svg?raw')
  // const buildingSvg = require('~/assets/svg/Process building_Monochromatic.svg?raw')
  const buildingSvg = require('~/assets/svg/Team building _Two Color.svg?raw')

  export default {
    components: {
      SectionTabs,
      DatasetActions,
      DatasetInfo,
      DatasetSchema,
      DatasetExtensions,
      DatasetAttachments,
      DatasetTable,
      DatasetCalendar,
      DatasetMap,
      DatasetVirtual,
      DatasetSearchFiles,
      DatasetThumbnails,
      DatasetThumbnailsOpts,
      DatasetPublications,
      DatasetStatus,
      DatasetApplications,
      DatasetExternalReuses,
      DatasetMasterData,
      Permissions,
      Journal,
      NavigationRight,
      ActionsButton,
      Toc,
    },
    async fetch({ store, route }) {
      store.dispatch('dataset/clear')
      await Promise.all([
        store.dispatch('dataset/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    data: () => ({
      settingsSvg,
      dataSvg,
      chartSvg,
      shareSvg,
      checklistSvg,
      buildingSvg,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('dataset', ['dataset', 'api', 'journal', 'error']),
      ...mapGetters('dataset', ['resourceUrl', 'can', 'hasPublicApplications']),
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      fileProperty() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      sections() {
        const sections = []
        if (!this.dataset) return sections
        if (this.dataset.finalizedAt) {
          sections.push({ title: 'Structure', id: 'structure' })
          sections.push({ title: 'Métadonnées', id: 'metadata' })
        }
        if (this.can('readLines') && this.dataset.finalizedAt) {
          sections.push({ title: 'Données', id: 'data' })
        }
        if (this.dataset.finalizedAt) {
          sections.push({ title: 'Utilisations', id: 'reuses' })
          sections.push({ title: 'Partage', id: 'share' })
        }
        if (this.can('readJournal')) {
          sections.push({ title: 'Activité', id: 'activity' })
        }
        return sections
      },
    },
    created() {
      // children pages are deprecated
      const path = `/dataset/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      if (this.dataset) {
        this.$store.dispatch('breadcrumbs', [{ text: 'Jeux de données', to: '/datasets' }, { text: this.dataset.title || this.dataset.id }])
        this.subscribe()
      }
    },
    methods: {
      ...mapActions('dataset', ['subscribe']),
    },
  }
</script>

<style>
.dataset .v-tab {
  font-weight: bold;
}
</style>
