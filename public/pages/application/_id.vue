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
          <doc-link
            v-if="prodBaseApp"
            :tooltip="`Consultez la documentation sur l'application ${prodBaseApp.title}`"
            :doc-href="prodBaseApp.documentation"
            offset="left"
          />
          <v-row class="application">
            <v-col>
              <section-tabs
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
              </section-tabs>

              <section-tabs
                :min-height="390"
                :svg="creativeSvg"
                svg-no-margin
                :section="sections.find(s => s.id === 'config')"
              >
                <template v-slot:tabs>
                  <v-tab href="#config-config">
                    <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Édition
                  </v-tab>
                </template>
                <template v-slot:tabs-items>
                  <v-tab-item value="config-config">
                    <v-container fluid class="pb-0">
                      <application-config />
                    </v-container>
                  </v-tab-item>
                </template>
              </section-tabs>

              <section-tabs
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

                  <v-tab href="#share-publications">
                    <v-icon>mdi-publish</v-icon>&nbsp;&nbsp;Publications
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

                  <v-tab-item value="share-publications">
                    <application-publications />
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
                        type="application"
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
      <application-actions />
      <toc :sections="sections" />
    </navigation-right>
    <actions-button v-else>
      <template v-slot:actions>
        <application-actions />
      </template>
    </actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import ApplicationActions from '~/components/applications/actions.vue'
  import ApplicationInfo from '~/components/applications/info.vue'
  import ApplicationPublications from '~/components/applications/publications.vue'
  import ApplicationProtectedLinks from '~/components/applications/protected-links.vue'
  import ApplicationConfig from '~/components/applications/config.vue'
  import Permissions from '~/components/permissions.vue'
  import Journal from '~/components/journal.vue'
  import SectionTabs from '~/components/layout/section-tabs.vue'
  import NavigationRight from '~/components/layout/navigation-right'
  import ActionsButton from '~/components/layout/actions-button'
  import Toc from '~/components/layout/toc.vue'

  const checklistSvg = require('~/assets/svg/Checklist_Two Color.svg?raw')
  const creativeSvg = require('~/assets/svg/Creative Process_Two Color.svg?raw')
  const shareSvg = require('~/assets/svg/Share_Two Color.svg?raw')
  const settingsSvg = require('~/assets/svg/Settings_Monochromatic.svg?raw')

  export default {
    components: {
      ApplicationActions,
      ApplicationInfo,
      ApplicationPublications,
      ApplicationProtectedLinks,
      ApplicationConfig,
      Permissions,
      Journal,
      SectionTabs,
      NavigationRight,
      ActionsButton,
      Toc,
    },
    async fetch({ store, params, route }) {
      store.dispatch('application/clear')
      await store.dispatch('application/setId', route.params.id)
    },
    data: () => ({
      checklistSvg,
      creativeSvg,
      shareSvg,
      settingsSvg,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application', 'api', 'journal', 'prodBaseApp', 'error']),
      ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink', 'hasPrivateDatasets']),
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
