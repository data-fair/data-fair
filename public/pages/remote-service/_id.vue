<template>
  <v-row v-if="remoteService">
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row class="remoteService">
          <v-col>
            <section-tabs
              :min-height="300"
              :svg="checklistSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'metadata')"
            >
              <template v-slot:tabs>
                <v-tab href="#metadata-info">
                  <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
                </v-tab>

                <v-tab href="#metadata-extensions">
                  <v-icon>mdi-merge</v-icon>&nbsp;&nbsp;Extensions supportées
                </v-tab>
              </template>
              <template v-slot:tabs-items>
                <v-tab-item value="metadata-info">
                  <v-container fluid class="pb-0">
                    <remote-service-info />
                  </v-container>
                </v-tab-item>

                <v-tab-item value="metadata-extensions">
                  <v-container fluid class="pb-0">
                    <remote-service-schema />
                  </v-container>
                </v-tab-item>
              </template>
            </section-tabs>

            <section-tabs
              :min-height="300"
              :svg="settingsSvg"
              svg-no-margin
              :section="sections.find(s => s.id === 'config')"
            >
              <template v-slot:tabs>
                <v-tab href="#config-params">
                  <v-icon>mdi-pencil</v-icon>&nbsp;&nbsp;Paramètres
                </v-tab>
              </template>
              <template v-slot:tabs-items>
                <v-tab-item value="config-params">
                  <v-container fluid class="pb-0">
                    <remote-service-config />
                  </v-container>
                </v-tab-item>
              </template>
            </section-tabs>
          </v-col>
        </v-row>
      </v-container>
    </v-col>

    <navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <remote-service-actions />
      <toc :sections="sections" />
    </navigation-right>
    <actions-button v-else>
      <template v-slot:actions>
        <remote-service-actions />
      </template>
    </actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import RemoteServiceActions from '~/components/remote-services/actions.vue'
  import RemoteServiceInfo from '~/components/remote-services/info.vue'
  import RemoteServiceSchema from '~/components/remote-services/schema.vue'
  import RemoteServiceConfig from '~/components/remote-services/config.vue'
  import SectionTabs from '~/components/layout/section-tabs.vue'
  import NavigationRight from '~/components/layout/navigation-right'
  import ActionsButton from '~/components/layout/actions-button'
  import Toc from '~/components/layout/toc.vue'

  const checklistSvg = require('~/assets/svg/Checklist_Two Color.svg?raw')
  const settingsSvg = require('~/assets/svg/Settings_Two Color.svg?raw')

  export default {
    components: {
      RemoteServiceActions,
      RemoteServiceInfo,
      RemoteServiceSchema,
      RemoteServiceConfig,
      SectionTabs,
      NavigationRight,
      ActionsButton,
      Toc,
    },
    async fetch({ store, params, route }) {
      store.dispatch('remoteService/clear')
      await Promise.all([
        store.dispatch('remoteService/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    data: () => ({
      checklistSvg,
      settingsSvg,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState('remoteService', ['remoteService', 'api']),
      ...mapGetters('remoteService', ['resourceUrl']),
      sections() {
        const sections = []
        if (!this.remoteService) return sections
        sections.push({ title: 'Métadonnées', id: 'metadata' })
        sections.push({ title: 'Configuration', id: 'config' })
        return sections
      },
    },
    created() {
      // children pages are deprecated
      const path = `/remote-service/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      this.$store.dispatch('breadcrumbs', [{ text: 'Services', to: '/remote-services' }, { text: this.remoteService.title || this.remoteService.id }])
    },
    methods: {
      ...mapActions('remoteService', ['patch', 'remove', 'refresh']),
      async confirmRemove() {
        this.showDeleteDialog = false
        await this.remove()
        this.$router.push({ path: '/remote-services' })
      },
    },
  }
</script>

<style>
.remoteService .v-tab {
  font-weight: bold;
}
</style>
