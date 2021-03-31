<template>
  <v-row v-if="application || error" class="fluid">
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
          <layout-doc-link
            v-if="prodBaseApp"
            :tooltip="`Consultez la documentation sur l'application ${prodBaseApp.title}`"
            :doc-href="prodBaseApp.documentation"
            offset="left"
          />
          <v-row class="application">
            <v-col>
              <layout-section-tabs
                :svg="checklistSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'metadata')"
              >
                <template v-slot:tabs>
                  <v-tab href="#metadata-info">
                    <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="metadata-info">
                    <v-container fluid class="pb-0">
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
                <template v-slot:tabs>
                  <v-tab href="#config-config">
                    <v-icon>mdi-pencil</v-icon>&nbsp;&nbsp;Édition
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="config-config">
                    <v-container fluid class="pa-0">
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
                <template v-slot:title>
                  Partage
                </template>
                <template v-slot:tabs>
                  <v-tab href="#share-permissions">
                    <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Permissions
                  </v-tab>

                  <v-tab v-if="can('getKeys')" href="#share-links">
                    <v-icon>mdi-link</v-icon>&nbsp;&nbsp;Lien protégé
                  </v-tab>

                  <v-tab href="#share-publication-sites">
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
                        type="application"
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
      <application-actions :publication-sites="publicationSites" />
      <layout-toc :sections="sections" />
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template v-slot:actions>
        <application-actions :publication-sites="publicationSites" />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    async fetch({ store, params, route }) {
      store.dispatch('application/clear')
      await store.dispatch('application/setId', route.params.id)
      if (store.state.application.application) {
        await store.dispatch('fetchPublicationSites', store.state.application.application.owner)
      }
    },
    data: () => ({
      checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
      creativeSvg: require('~/assets/svg/Creative Process_Two Color.svg?raw'),
      shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
      settingsSvg: require('~/assets/svg/Settings_Monochromatic.svg?raw'),
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application', 'api', 'journal', 'prodBaseApp', 'error']),
      ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink', 'hasPrivateDatasets']),
      publicationSites() {
        if (!this.application) return []
        return this.$store.getters.ownerPublicationSites(this.application.owner)
      },
      sections() {
        const sections = []
        if (!this.application) return sections
        sections.push({ title: 'Métadonnées', id: 'metadata' })
        sections.push({ title: 'Configuration', id: 'config' })
        sections.push({ title: 'Partage', id: 'share' })
        if (this.can('readJournal')) {
          sections.push({ title: 'Activité', id: 'activity' })
        }
        return sections
      },
    },
    created() {
      // children pages are deprecated
      const path = `/application/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      if (this.application) {
        this.$store.dispatch('breadcrumbs', [{ text: 'Visualisations', to: '/applications' }, { text: this.application.title || this.application.id }])
        this.subscribe()
      }
    },
    methods: {
      ...mapActions('application', ['patch', 'subscribe']),
    },
  }
</script>

<style>
.application .v-tab {
  font-weight: bold;
}
</style>
