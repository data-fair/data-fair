<template>
  <v-row v-if="application">
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <tutorial-alert
          v-if="prodBaseApp && prodBaseApp.documentation"
          :id="prodBaseApp.url"
          :text="`Consultez la documentation sur l'application ${prodBaseApp.title}`"
          :href="prodBaseApp.documentation"
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
              </template>
              <template #tabs-items>
                <v-tab-item value="metadata-info">
                  <v-container
                    fluid
                    class="pb-0"
                  >
                    <tutorial-alert id="app-configure-meta">
                      {{ $t('tutorialConfigMeta') }}
                    </tutorial-alert>
                    <application-info />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              :min-height="390"
              :svg="creativeSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'config')"
            >
              <template #tabs>
                <v-tab href="#config-config">
                  <v-icon>mdi-pencil</v-icon>&nbsp;&nbsp;{{ $t('edit') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <v-tab-item value="config-config">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <application-config />
                  </v-container>
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
                <v-tab href="#share-permissions">
                  <v-icon>mdi-security</v-icon>&nbsp;&nbsp;{{ $t('permissions') }}
                </v-tab>

                <v-tab
                  v-if="can('getKeys')"
                  href="#share-links"
                >
                  <v-icon>mdi-link</v-icon>&nbsp;&nbsp;{{ $t('protectedLink') }}
                </v-tab>

                <v-tab
                  v-if="publicationSites"
                  href="#share-publication-sites"
                >
                  <v-icon>mdi-presentation</v-icon>&nbsp;&nbsp;{{ $t('portals') }}
                </v-tab>

                <v-tab href="#share-publications">
                  <v-icon>mdi-transit-connection</v-icon>&nbsp;&nbsp;{{ $t('catalogs') }}
                </v-tab>
              </template>
              <template #tabs-items>
                <tutorial-alert id="app-share-portal">
                  {{ $t('tutorialShare') }}
                </tutorial-alert>
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

                <v-tab-item value="share-publication-sites">
                  <application-publication-sites :publication-sites="publicationSites" />
                </v-tab-item>

                <v-tab-item value="share-publications">
                  <application-catalog-publications />
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
  tutorialConfigMeta: Vous pouvez configurer des thématiques dans les paramètres.
  edit: Édition
  permissions: Permissions
  protectedLink: Lien protégé
  portals: Portails
  catalogs: Catalogues
  tutorialShare: Configurez des portails pour mieux partager vos données au public ou en interne.
  activity: Activité
  journal: Journal
  visualizations: visualisations
  metadata: Métadonnées
  config: Configuration
  share: Partage
en:
  info: Information
  tutorialConfigMeta: You can configure topics in the parameters.
  edit: Edition
  permissions: Permissions
  protectedLink: Protected link
  portals: Portals
  catalogs: Catalogs
  tutorialShare: Configure portals to better publish your data privately or publicly.
  activity: Activity
  journal: Journal
  visualizations: visualizations
  metadata: Metadata
  config: Configuration
  share: Share
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
    creativeSvg: require('~/assets/svg/Creative Process_Two Color.svg?raw'),
    shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
    settingsSvg: require('~/assets/svg/Settings_Monochromatic.svg?raw')
  }),
  async fetch ({ store, params, route }) {
    store.dispatch('application/clear')
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
    ...mapState('application', ['application', 'api', 'journal', 'prodBaseApp']),
    ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink', 'hasPrivateDatasets']),
    publicationSites () {
      if (!this.application) return []
      return this.$store.getters.ownerPublicationSites(this.application.owner)
    },
    sections () {
      const sections = []
      if (!this.application) return sections
      sections.push({ title: this.$t('metadata'), id: 'metadata' })
      sections.push({ title: this.$t('config'), id: 'config' })
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
    const path = `/application/${this.$route.params.id}`
    if (this.$route.path !== path) return this.$router.push(path)
    if (this.application) {
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('visualizations'), to: '/applications' }, { text: this.application.title || this.application.id }])
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
