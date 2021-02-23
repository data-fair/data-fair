<template>
  <v-row v-if="dataset || error">
    <v-col>
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
                v-if="dataset.finalizedAt"
                :min-height="390"
                default-tab="tab-general-info"
                :svg="checklistSvg"
              >
                <template v-slot:title>
                  métadonnées
                </template>
                <template v-slot:tabs>
                  <v-tab href="#tab-general-info">
                    <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
                  </v-tab>

                  <template v-if="can('writeDescription') && dataset.isVirtual">
                    <v-tab href="#tab-general-virtual">
                      <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>&nbsp;&nbsp;Jeu virtuel
                    </v-tab>
                  </template>

                  <v-tab href="#tab-general-schema">
                    <v-icon>mdi-table-cog</v-icon>&nbsp;&nbsp;Schéma
                  </v-tab>

                  <v-tab href="#tab-general-extensions">
                    <v-icon>mdi-merge</v-icon>&nbsp;&nbsp;Enrichissement
                  </v-tab>

                  <v-tab href="#tab-general-attachments">
                    <v-icon>mdi-attachment</v-icon>&nbsp;&nbsp;Pièces jointes
                  </v-tab>
                  <v-tab
                    v-if="user.adminMode"
                    href="#tab-general-masterdata"
                    class="admin--text"
                  >
                    <v-icon color="admin">
                      mdi-star-four-points
                    </v-icon>&nbsp;&nbsp;Données de référence
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="tab-general-info">
                    <doc-link tooltip="Consultez la documentation sur l'édition de jeux de données" doc-key="datasetEdit" />
                    <v-container fluid class="pb-0">
                      <dataset-info />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-general-virtual">
                    <v-container fluid>
                      <dataset-virtual />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-general-schema">
                    <v-container fluid class="pb-0">
                      <dataset-schema />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-general-attachments">
                    <doc-link tooltip="Consultez la documentation sur les pièces jointes des jeux de données" doc-key="datasetAttachments" />
                    <dataset-attachments />
                  </v-tab-item>

                  <v-tab-item value="tab-general-extensions">
                    <doc-link tooltip="Consultez la documentation sur l'extension de jeux de données" doc-key="datasetExtend" />
                    <v-container fluid class="pt-0">
                      <dataset-extensions />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-general-masterdata">
                    <dataset-master-data />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                v-if="can('readLines') && dataset.finalizedAt"
                default-tab="tab-preview-table"
                :svg="dataSvg"
              >
                <template v-slot:title>
                  données
                </template>
                <template v-slot:tabs>
                  <v-tab href="#tab-preview-table">
                    <v-icon>mdi-table</v-icon>&nbsp;&nbsp;Tableau
                  </v-tab>

                  <v-tab v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))" href="#tab-preview-calendar">
                    <v-icon>mdi-calendar-range</v-icon>&nbsp;&nbsp;Calendrier
                  </v-tab>

                  <v-tab v-if="dataset.bbox" href="#tab-preview-map">
                    <v-icon>mdi-map</v-icon>&nbsp;&nbsp;Carte
                  </v-tab>

                  <v-tab v-if="fileProperty" href="#tab-preview-files">
                    <v-icon>mdi-content-copy</v-icon>&nbsp;&nbsp;Fichiers
                  </v-tab>

                  <v-tab v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')" href="#tab-preview-thumbnails">
                    <v-icon>mdi-image</v-icon>&nbsp;&nbsp;Vignettes
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="tab-preview-table">
                    <dataset-table />
                  </v-tab-item>

                  <v-tab-item value="tab-preview-calendar">
                    <v-container fluid class="pa-0">
                      <dataset-calendar />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-preview-map">
                    <v-container fluid class="pa-0">
                      <dataset-map fixed-height="600" />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-preview-files">
                    <v-container fluid class="pa-0">
                      <dataset-search-files />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-preview-thumbnails">
                    <v-container fluid>
                      <dataset-thumbnails-opts v-if="can('writeDescription')" />
                      <dataset-thumbnails />
                    </v-container>
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                v-if="dataset.finalizedAt"
                default-tab="tab-reuses-apps"
                :svg="chartSvg"
                :min-height="140"
              >
                <template v-slot:title>
                  utilisations
                </template>
                <template v-slot:tabs>
                  <v-tab href="#tab-reuses-apps">
                    <v-icon>mdi-image-multiple</v-icon>&nbsp;&nbsp;Visualisations
                  </v-tab>

                  <v-tab href="#tab-reuses-external">
                    <v-icon>mdi-open-in-new</v-icon>&nbsp;&nbsp;Réutilisations externes
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="tab-reuses-apps">
                    <dataset-applications />
                  </v-tab-item>

                  <v-tab-item value="tab-reuses-external">
                    <dataset-external-reuses />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                v-if="dataset.finalizedAt"
                :svg="shareSvg"
                :min-height="200"
              >
                <template v-slot:title>
                  partage
                </template>
                <template v-slot:tabs>
                  <v-tab href="#tab-publish-permissions">
                    <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Permissions
                  </v-tab>

                  <v-tab href="#tab-publish-publications">
                    <v-icon>mdi-publish</v-icon>&nbsp;&nbsp;Publications
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="tab-publish-permissions">
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

                  <v-tab-item value="tab-publish-publications">
                    <dataset-publications />
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
                v-if="can('readJournal') || can('readApiDoc')"
                :default-tab="dataset.finalizedAt ? '' : 'tab-tech-journal'"
                :svg="settingsSvg"
                :min-height="550"
              >
                <template v-slot:title>
                  activité
                </template>
                <template v-slot:tabs>
                  <v-tab v-if="can('readJournal')" href="#tab-tech-journal">
                    <v-icon>mdi-calendar-text</v-icon>&nbsp;&nbsp;Journal
                  </v-tab>

                  <v-tab v-if="can('readApiDoc') && dataset.finalizedAt" href="#tab-tech-apidoc">
                    <v-icon>mdi-cloud</v-icon>&nbsp;&nbsp;API
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="tab-tech-journal">
                    <v-container fluid class="pa-0">
                      <journal
                        :journal="journal"
                        type="dataset"
                      />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="tab-tech-apidoc">
                    <v-container fluid class="pa-0">
                      <open-api
                        v-if="resourceUrl"
                        :url="resourceUrl + '/api-docs.json'"
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
    <div v-if="this.$vuetify.breakpoint.lgAndUp" style="width:256px;">
      <navigation-right>
        <template v-slot:actions>
          <dataset-actions />
        </template>
      </navigation-right>
    </div>
    <actions-button v-else>
      <template v-slot:actions>
        <dataset-actions />
      </template>
    </actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import SectionTabs from '~/components/layout/section-tabs.vue'
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
  import OpenApi from '~/components/open-api.vue'
  import NavigationRight from '~/components/layout/navigation-right'
  import ActionsButton from '~/components/layout/actions-button'

  const datavizSvg = require('~/assets/svg/undraw_All_the_data_re_hh4w.svg?raw')
  const penSvg = require('~/assets/svg/undraw_pen_nqf7.svg?raw')
  const textSvg = require('~/assets/svg/undraw_text_field_htlv.svg?raw')
  const settingsSvg = require('~/assets/svg/Settings_Monochromatic.svg?raw')
  const dataSvg = require('~/assets/svg/Data storage_Monochromatic.svg?raw')
  // const chartSvg = require('~/assets/svg/Smart phone data_Monochromatic.svg?raw')
  const chartSvg = require('~/assets/svg/Graphics and charts_Monochromatic.svg?raw')
  const shareSvg = require('~/assets/svg/Share_Monochromatic.svg?raw')
  const checklistSvg = require('~/assets/svg/Checklist _Monochromatic.svg?raw')
  const campaignSvg = require('~/assets/svg/Campaign launch_Monochromatic.svg?raw')

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
      OpenApi,
      NavigationRight,
      ActionsButton,
    },
    async fetch({ store, route }) {
      store.dispatch('dataset/clear')
      await Promise.all([
        store.dispatch('dataset/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    data: () => ({
      datavizSvg,
      penSvg,
      textSvg,
      settingsSvg,
      dataSvg,
      chartSvg,
      shareSvg,
      checklistSvg,
      campaignSvg,
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
