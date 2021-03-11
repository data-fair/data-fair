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

              <layout-section-tabs
                :min-height="180"
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
                    <layout-doc-link tooltip="Consultez la documentation sur l'extension de jeux de données" doc-key="datasetExtend" />
                    <v-container fluid class="pt-0">
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
                    <layout-doc-link tooltip="Consultez la documentation sur l'édition de jeux de données" doc-key="datasetEdit" />
                    <v-container fluid class="py-0">
                      <dataset-info />
                    </v-container>
                  </v-tab-item>

                  <v-tab-item value="metadata-attachments">
                    <layout-doc-link tooltip="Consultez la documentation sur les pièces jointes des jeux de données" doc-key="datasetAttachments" />
                    <dataset-attachments />
                  </v-tab-item>
                </template>
              </layout-section-tabs>

              <layout-section-tabs
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
              </layout-section-tabs>

              <layout-section-tabs
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
              </layout-section-tabs>

              <layout-section-tabs
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

                  <v-tab v-if="publicationSites && publicationSites.length" href="#share-publication-sites">
                    <v-icon>mdi-presentation</v-icon>&nbsp;&nbsp;Portails
                  </v-tab>

                  <v-tab href="#share-publications">
                    <v-icon>mdi-transit-connection</v-icon>&nbsp;&nbsp;Catalogues
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

                  <v-tab-item value="share-publication-sites">
                    <dataset-publication-sites :publication-sites="publicationSites" />
                  </v-tab-item>

                  <v-tab-item value="share-publications">
                    <dataset-catalog-publications />
                  </v-tab-item>
                </template>
              </layout-section-tabs>

              <layout-section-tabs
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
              </layout-section-tabs>
            </v-col>
          </v-row>
        </template>
      </v-container>
    </v-col>

    <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <dataset-actions />
      <layout-toc :sections="sections" />
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template v-slot:actions>
        <dataset-actions />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    async fetch({ store, route }) {
      store.dispatch('dataset/clear')
      await Promise.all([
        store.dispatch('dataset/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
      await store.dispatch('fetchPublicationSites', store.state.dataset.dataset.owner)
    },
    data: () => ({
      settingsSvg: require('~/assets/svg/Settings_Monochromatic.svg?raw'),
      dataSvg: require('~/assets/svg/Data storage_Two Color.svg?raw'),
      chartSvg: require('~/assets/svg/Graphics and charts_Two Color.svg?raw'),
      shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
      checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
      buildingSvg: require('~/assets/svg/Team building _Two Color.svg?raw'),
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('dataset', ['dataset', 'api', 'journal', 'error']),
      ...mapGetters('dataset', ['resourceUrl', 'can', 'hasPublicApplications']),
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      publicationSites() {
        return this.$store.getters.ownerPublicationSites(this.dataset.owner)
      },
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
