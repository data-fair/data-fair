<template>
  <v-row v-if="application">
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <tutorial-alert
          v-if="prodBaseApp && prodBaseApp.documentation"
          :id="prodBaseApp.url"
          :text="`Consultez la documentation sur l'application ${prodBaseApp.title}`"
          :href="prodBaseApp.documentation"
          persistent
        />
        <v-row class="application">
          <v-col>
            <layout-section-tabs
              :svg="checklistSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'metadata')"
            >
              <template #tabs>
                <v-tab href="#metadata-info">
                  <v-icon>mdi-information</v-icon>&nbsp;&nbsp;{{ $t('info') }}
                </v-tab>
                <v-tab
                  key="attachments"
                  href="#attachments"
                >
                  <v-icon>mdi-attachment</v-icon>&nbsp;&nbsp;{{ $t('attachments') }}
                </v-tab>
                <v-tab
                  v-if="datasets.length"
                  href="#datasets"
                >
                  <v-icon>mdi-database</v-icon>&nbsp;&nbsp;{{ $t('datasets') }}
                </v-tab>
                <v-tab
                  v-if="childrenApps.length"
                  href="#children-apps"
                >
                  <v-icon>mdi-image-multiple</v-icon>&nbsp;&nbsp;{{ $t('childrenApps') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="metadata-info">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <tutorial-alert
                      id="app-configure-meta"
                      :text="$t('tutorialConfigMeta')"
                      persistent
                    />
                    <application-info />
                  </v-container>
                </v-tab-item>
                <v-tab-item value="attachments">
                  <application-attachments />
                </v-tab-item>
                <v-tab-item value="datasets">
                  <v-container
                    fluid
                  >
                    <v-row
                      class="resourcesList"
                    >
                      <v-col
                        v-for="dataset in datasets"
                        :key="dataset.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <dataset-card :dataset="dataset" />
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tab-item>
                <v-tab-item value="children-apps">
                  <v-container
                    fluid
                  >
                    <v-row
                      class="resourcesList"
                    >
                      <v-col
                        v-for="app in childrenApps"
                        :key="app.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <application-card :application="app" />
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :min-height="390"
              :svg="creativeSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'render')"
            >
              <template #tabs>
                <v-tab href="#render-config">
                  <v-icon>mdi-square-edit-outline</v-icon>&nbsp;&nbsp;{{ $t('config') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="render-config">
                  <v-alert
                    v-if="!!application.errorMessage"
                    type="error"
                    border="left"
                  >
                    <p v-html="$t('validatedError')" />
                    <p
                      class="mb-0"
                      v-html="application.errorMessage"
                    />
                  </v-alert>
                  <v-btn
                    v-if="can('writeConfig')"
                    :to="'/application/' + application.id + '/config'"
                    color="primary"
                    class="mt-2 mb-4"
                  >
                    {{ $t('editConfig') }}
                  </v-btn>
                  <v-card
                    light
                    class="pa-0"
                    outlined
                    tile
                  >
                    <v-iframe
                      :src="applicationLink + '?embed=true'"
                    />
                  </v-card>
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :section="sections.find(s => s.id === 'share')"
              :svg="shareSvg"
              svg-no-margin
              :min-height="250"
            >
              <template #title>
                Partage
              </template>
              <template #tabs>
                <v-tab
                  v-if="can('getPermissions')"
                  href="#share-permissions"
                >
                  <v-icon>mdi-security</v-icon>&nbsp;&nbsp;{{ $t('permissions') }}
                </v-tab>

                <v-tab
                  v-if="can('getKeys')"
                  href="#share-links"
                >
                  <v-icon>mdi-cloud-key</v-icon>&nbsp;&nbsp;{{ $t('protectedLink') }}
                </v-tab>

                <v-tab
                  v-if="!env.disablePublicationSites"
                  href="#share-publication-sites"
                >
                  <v-icon>mdi-presentation</v-icon>&nbsp;&nbsp;{{ $t('portals') }}
                </v-tab>

                <!-- disabled as we have a problem : topic is now a required property in udata
                     we will need to show a select based on https://www.data.gouv.fr/api/1/topics/?page=1&page_size=20
                <v-tab href="#share-publications">
                  <v-icon>mdi-transit-connection</v-icon>&nbsp;&nbsp;{{ $t('catalogs') }}
                </v-tab>
                -->
              </template>
              <template #tabs-items>
                <tutorial-alert
                  id="app-share-portal"
                  :text="$t('tutorialShare')"
                />
                <v-tab-item value="share-permissions">
                  <v-container fluid>
                    <permissions
                      v-if="can('getPermissions')"
                      :disabled="!can('setPermissions')"
                      :resource="application"
                      :resource-url="resourceUrl"
                      :api="api"
                      :has-private-parents="hasPrivateDatasets"
                    />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="share-links">
                  <v-container fluid>
                    <application-protected-links />
                  </v-container>
                </v-tab-item>

                <v-tab-item
                  v-if="!env.disablePublicationSites"
                  value="share-publication-sites"
                >
                  <application-publication-sites :publication-sites="publicationSites" />
                </v-tab-item>

                <!--<v-tab-item value="share-publications">
                  <application-catalog-publications />
                </v-tab-item>-->
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
                      type="application"
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
      <application-actions :publication-sites="publicationSites" />
      <layout-toc :sections="sections" />
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template #actions>
        <application-actions :publication-sites="publicationSites" />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  info: Informations
  attachments: Pièces jointes
  tutorialConfigMeta: Vous pouvez configurer des thématiques dans les paramètres.
  edit: Édition
  permissions: Permissions
  protectedLink: Lien protégé
  portals: Portails
  catalogs: Catalogues
  tutorialShare: Configurez des portails pour mieux partager vos données au public ou en interne.
  activity: Activité
  journal: Journal
  applications: applications
  metadata: Métadonnées
  render: Rendu
  share: Partage
  config: Configuration
  editConfig: Éditer la configuration
  validatedError: Erreur dans la <b>version validée</b>
  datasets: Jeux de données utilisés
  childrenApps: Applications utilisées
en:
  info: Information
  attachments: Attachments
  tutorialConfigMeta: You can configure topics in the parameters.
  edit: Edition
  permissions: Permissions
  protectedLink: Protected link
  portals: Portals
  catalogs: Catalogs
  tutorialShare: Configure portals to better publish your data privately or publicly.
  activity: Activity
  journal: Journal
  applications: applications
  metadata: Metadata
  render: Render
  share: Share
  config: Configuration
  editConfig: Edit configuration
  validatedError: Error in the <b>validated version</b>
  datasets: Used datasets
  childrenApps: Used applications
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'

export default {
  components: {
    VIframe
  },
  middleware: ['auth-required'],
  data: () => ({
    checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
    creativeSvg: require('~/assets/svg/Creative Process_Two Color.svg?raw'),
    shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
    settingsSvg: require('~/assets/svg/Settings_Monochromatic.svg?raw')
  }),
  async fetch ({ store, params, route }) {
    if (store.state.application?.applicationId !== route.params.id) {
      store.dispatch('application/clear')
    }
    await store.dispatch('application/setId', route.params.id)
    if (store.state.application.application) {
      try {
        await store.dispatch('fetchPublicationSites', store.state.application.application.owner)
      } catch (err) {
        if (!err.response || err.response.status !== 403) throw err
      }
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application', 'api', 'journal', 'prodBaseApp', 'datasets', 'childrenApps']),
    ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink', 'hasPrivateDatasets']),
    publicationSites () {
      if (!this.application || this.env.disablePublicationSites) return []
      return this.$store.getters.ownerPublicationSites(this.application.owner)
    },
    sections () {
      const sections = []
      if (!this.application) return sections
      sections.push({ title: this.$t('metadata'), id: 'metadata' })
      sections.push({ title: this.$t('render'), id: 'render' })
      if (!this.env.disableSharing) {
        sections.push({ title: this.$t('share'), id: 'share' })
      }
      if (this.can('readJournal')) {
        sections.push({ title: this.$t('activity'), id: 'activity' })
      }
      return sections
    }
  },
  created () {
    // children pages are deprecated
    if (this.application) {
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('applications'), to: '/applications' }, { text: this.application.title || this.application.id }])
      this.subscribe()
    }
  },
  methods: {
    ...mapActions('application', ['patch', 'subscribe'])
  }
}
</script>

<style>
.application .v-tab {
  font-weight: bold;
}
</style>
