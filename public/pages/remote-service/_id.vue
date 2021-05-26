<template>
  <v-row v-if="remoteService">
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row class="remoteService">
          <v-col>
            <layout-section-tabs
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
            </layout-section-tabs>

            <layout-section-tabs
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
                  <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Visibilité
                </v-tab>
              </template>
              <template v-slot:tabs-items>
                <tutorial-alert id="dataset-share-portal">
                  Contrôlez l'utilisation de ce service distant par vos utilisateurs.
                </tutorial-alert>
                <v-tab-item value="share-permissions">
                  <v-container fluid>
                    <remote-service-access />
                  </v-container>
                </v-tab-item>
              </template>
            </layout-section-tabs>
          </v-col>
        </v-row>
      </v-container>
    </v-col>

    <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
      <remote-service-actions />
      <layout-toc :sections="sections" />
    </layout-navigation-right>
    <layout-actions-button v-else>
      <template v-slot:actions>
        <remote-service-actions />
      </template>
    </layout-actions-button>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    async fetch({ store, params, route }) {
      store.dispatch('remoteService/clear')
      await Promise.all([
        store.dispatch('remoteService/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    data: () => ({
      checklistSvg: require('~/assets/svg/Checklist_Two Color.svg?raw'),
      settingsSvg: require('~/assets/svg/Settings_Two Color.svg?raw'),
      shareSvg: require('~/assets/svg/Share_Two Color.svg?raw'),
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
        sections.push({ title: 'Partage', id: 'share' })
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
