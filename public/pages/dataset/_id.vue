<template>
  <v-container v-if="dataset" fluid>
    <v-row class="dataset">
      <v-col>
        <dataset-status />
        <v-card
          outlined
          style="min-height: 440px;"
          class="mt-4"
        >
          <v-tabs background-color="grey lighten-3">
            <v-tab href="#tab-general-info">
              <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
            </v-tab>
            <v-tab-item value="tab-general-info">
              <doc-link tooltip="Consultez la documentation sur l'édition de jeux de données" doc-key="datasetEdit" />
              <v-container fluid class="pb-0">
                <dataset-info />
              </v-container>
            </v-tab-item>

            <template v-if="can('writeDescription') && dataset.isVirtual">
              <v-tab href="#tab-general-virtual">
                <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>&nbsp;&nbsp;Jeu virtuel
              </v-tab>
              <v-tab-item value="tab-general-virtual">
                <v-container fluid>
                  <dataset-virtual />
                </v-container>
              </v-tab-item>
            </template>

            <v-tab href="#tab-general-schema">
              <v-icon>mdi-table-cog</v-icon>&nbsp;&nbsp;Schéma
            </v-tab>
            <v-tab-item value="tab-general-schema">
              <v-container fluid class="pb-0">
                <dataset-schema />
              </v-container>
            </v-tab-item>

            <v-tab href="#tab-general-extensions">
              <v-icon>mdi-merge</v-icon>&nbsp;&nbsp;Enrichissement
            </v-tab>
            <v-tab-item value="tab-general-extensions">
              <doc-link tooltip="Consultez la documentation sur l'extension de jeux de données" doc-key="datasetExtend" />
              <v-container fluid class="pt-0">
                <dataset-extensions />
              </v-container>
            </v-tab-item>

            <v-tab href="#tab-general-attachments">
              <v-icon>mdi-attachment</v-icon>&nbsp;&nbsp;Pièces jointes
            </v-tab>
            <v-tab-item value="tab-general-attachments">
              <doc-link tooltip="Consultez la documentation sur les pièces jointes des jeux de données" doc-key="datasetAttachments" />
              <dataset-attachments />
            </v-tab-item>
          </v-tabs>
        </v-card>

        <v-card
          v-if="can('readLines')"
          outlined
          class="mt-6"
        >
          <v-tabs background-color="grey lighten-3">
            <v-tab href="#tab-preview-table">
              <v-icon>mdi-table</v-icon>&nbsp;&nbsp;Tableau
            </v-tab>
            <v-tab-item value="tab-preview-table">
              <dataset-table />
            </v-tab-item>

            <template v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))">
              <v-tab href="#tab-preview-calendar">
                <v-icon>mdi-calendar-range</v-icon>&nbsp;&nbsp;Calendrier
              </v-tab>
              <v-tab-item value="tab-preview-calendar">
                <v-container fluid class="pa-0">
                  <dataset-calendar />
                </v-container>
              </v-tab-item>
            </template>

            <template v-if="dataset.bbox">
              <v-tab href="#tab-preview-map">
                <v-icon>mdi-map</v-icon>&nbsp;&nbsp;Carte
              </v-tab>
              <v-tab-item value="tab-preview-map">
                <v-container fluid class="pa-0">
                  <dataset-map fixed-height="600" />
                </v-container>
              </v-tab-item>
            </template>

            <template v-if="fileProperty">
              <v-tab href="#tab-preview-files">
                <v-icon>mdi-content-copy</v-icon>&nbsp;&nbsp;Fichiers
              </v-tab>
              <v-tab-item value="tab-preview-files">
                <v-container fluid class="pa-0">
                  <dataset-search-files />
                </v-container>
              </v-tab-item>
            </template>

            <template v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')">
              <v-tab href="#tab-preview-thumbnails">
                <v-icon>mdi-image</v-icon>&nbsp;&nbsp;Vignettes
              </v-tab>
              <v-tab-item value="tab-preview-thumbnails">
                <v-container fluid>
                  <dataset-thumbnails-opts v-if="can('writeDescription')" />
                  <dataset-thumbnails />
                </v-container>
              </v-tab-item>
            </template>
          </v-tabs>
        </v-card>

        <v-card outlined class="mt-6">
          <v-tabs background-color="grey lighten-3">
            <v-tab href="#tab-reuses-apps">
              <v-icon>mdi-image-multiple</v-icon>&nbsp;&nbsp;Visualisations
            </v-tab>
            <v-tab-item value="tab-reuses-apps">
              <dataset-applications />
            </v-tab-item>

            <v-tab href="#tab-reuses-external">
              <v-icon>mdi-open-in-new</v-icon>&nbsp;&nbsp;Réutilisations externes
            </v-tab>
            <v-tab-item value="tab-reuses-external">
              <dataset-external-reuses />
            </v-tab-item>
          </v-tabs>
        </v-card>

        <v-card
          v-if="can('getPermissions')"
          outlined
          style="min-height: 200px;"
          class="mt-6"
        >
          <v-tabs background-color="grey lighten-3">
            <v-tab href="#tab-publish-permissions">
              <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Permissions
            </v-tab>
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

            <v-tab href="#tab-publish-publications">
              <v-icon>mdi-publish</v-icon>&nbsp;&nbsp;Publications
            </v-tab>
            <v-tab-item value="tab-publish-publications">
              <dataset-publications />
            </v-tab-item>
          </v-tabs>
        </v-card>

        <v-card
          v-if="can('readJournal') || can('readApiDoc')"
          outlined
          class="mt-6"
        >
          <v-tabs background-color="grey lighten-3">
            <template v-if="can('readJournal')">
              <v-tab href="#tab-tech-journal">
                <v-icon>mdi-calendar-text</v-icon>&nbsp;&nbsp;Journal
              </v-tab>
              <v-tab-item value="tab-tech-journal">
                <v-container fluid class="pa-0">
                  <journal
                    :journal="journal"
                    type="dataset"
                  />
                </v-container>
              </v-tab-item>
            </template>

            <template v-if="can('readApiDoc')">
              <v-tab href="#tab-tech-apidoc">
                <v-icon>mdi-cloud</v-icon>&nbsp;&nbsp;API
              </v-tab>
              <v-tab-item value="tab-tech-apidoc">
                <v-container fluid class="pa-0">
                  <open-api
                    v-if="resourceUrl"
                    :url="resourceUrl + '/api-docs.json'"
                  />
                </v-container>
              </v-tab-item>
            </template>
          </v-tabs>
        </v-card>
      </v-col>
    </v-row>
    <dataset-actions />
  </v-container>
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
  import Permissions from '~/components/permissions.vue'
  import Journal from '~/components/journal.vue'
  import OpenApi from '~/components/open-api.vue'

  export default {
    components: {
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
      Permissions,
      Journal,
      OpenApi,
    },
    async fetch({ store, params, route }) {
      await Promise.all([
        store.dispatch('dataset/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    data: () => ({}),
    computed: {
      ...mapState('dataset', ['dataset', 'api', 'journal']),
      ...mapGetters('dataset', ['resourceUrl', 'can', 'hasPublicApplications']),
      fileProperty() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
    },
    created() {
      // children pages are deprecated
      const path = `/dataset/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      if (this.dataset) this.$store.dispatch('breadcrumbs', [{ text: 'Jeux de données', to: '/datasets' }, { text: this.dataset.title || this.dataset.id }])
      this.subscribe()
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('dataset', ['clear', 'subscribe']),
    },
  }
</script>

<style>
.dataset .v-tab {
  font-weight: bold;
}
</style>
