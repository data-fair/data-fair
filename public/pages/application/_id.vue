<template>
  <v-container v-if="application || error" fluid>
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
          <application-info />
          <application-config />
          <v-card
            v-if="can('getPermissions')"
            outlined
            style="min-height: 270px;"
            class="mt-4"
          >
            <v-tabs :background-color="$vuetify.theme.dark ? '' : 'grey lighten-3'">
              <v-tab href="#tab-publish-permissions">
                <v-icon>mdi-security</v-icon>&nbsp;&nbsp;Permissions
              </v-tab>
              <v-tab-item value="tab-publish-permissions">
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

              <template v-if="can('getKeys')">
                <v-tab href="#tab-publish-links">
                  <v-icon>mdi-link</v-icon>&nbsp;&nbsp;Lien protégé
                </v-tab>
                <v-tab-item value="tab-publish-links">
                  <v-container fluid>
                    <application-protected-links />
                  </v-container>
                </v-tab-item>
              </template>

              <v-tab href="#tab-publish-publications">
                <v-icon>mdi-publish</v-icon>&nbsp;&nbsp;Publications
              </v-tab>
              <v-tab-item value="tab-publish-publications">
                <application-publications />
              </v-tab-item>
            </v-tabs>
          </v-card>

          <v-card
            v-if="can('readJournal') || can('readApiDoc')"
            outlined
            class="mt-6"
          >
            <v-tabs :background-color="$vuetify.theme.dark ? '' : 'grey lighten-3'">
              <template v-if="can('readJournal')">
                <v-tab href="#tab-tech-journal">
                  <v-icon>mdi-calendar-text</v-icon>&nbsp;&nbsp;Journal
                </v-tab>
                <v-tab-item value="tab-tech-journal">
                  <v-container fluid class="pa-0">
                    <journal
                      :journal="journal"
                      type="application"
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

        <application-actions />
      </v-row>
    </template>
  </v-container>
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
  import OpenApi from '~/components/open-api.vue'

  export default {
    components: {
      ApplicationActions,
      ApplicationInfo,
      ApplicationPublications,
      ApplicationProtectedLinks,
      ApplicationConfig,
      Permissions,
      Journal,
      OpenApi,
    },
    async fetch({ store, params, route }) {
      await store.dispatch('application/setId', route.params.id)
    },
    data: () => ({}),
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application', 'api', 'journal', 'prodBaseApp', 'error']),
      ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink', 'hasPrivateDatasets']),
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
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('application', ['patch', 'clear', 'subscribe']),
    },
  }
</script>

<style>
.application .v-tab {
  font-weight: bold;
}
</style>
