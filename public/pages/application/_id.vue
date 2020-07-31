<template>
  <v-container v-if="application" fluid>
    <v-row class="application">
      <!--

        <v-list-item
          :disabled="!can('readConfig')"
          :nuxt="true"
          :to="`/application/${application.id}/config`"
        >
          <v-list-item-action><v-icon>mdi-wrench</v-icon></v-list-item-action>
          <v-list-item-title>Configuration</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/application/${application.id}/permissions`"
        >
          <v-list-item-action><v-icon>mdi-security</v-icon></v-list-item-action>
          <v-list-item-title>Permissions</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/application/${application.id}/publications`"
        >
          <v-list-item-action><v-icon>mdi-publish</v-icon></v-list-item-action>
          <v-list-item-title>Publications</v-list-item-title>
        </v-list-item>

      </v-list>
    </v-navigation-drawer>-->

      <v-col>
        <application-info />
        <application-config />
        <v-card
          v-if="can('getPermissions')"
          outlined
          style="min-height: 240px;"
          class="mt-4"
        >
          <v-tabs>
            <v-tab href="#tab-publish-permissions">
              Permissions
            </v-tab>
            <v-tab-item value="tab-publish-permissions">
              <v-container fluid class="pt-0">
                <permissions
                  v-if="can('getPermissions')"
                  :resource="application"
                  :resource-url="resourceUrl"
                  :api="api"
                />
              </v-container>
            </v-tab-item>

            <v-tab href="#tab-publish-publications">
              Publications
            </v-tab>
            <v-tab-item value="tab-publish-publications">
              <application-publications />
            </v-tab-item>
          </v-tabs>
        </v-card>

        <v-card
          v-if="can('readJournal') || can('readApiDoc')"
          outlined
          class="mt-4"
        >
          <v-tabs>
            <template v-if="can('readJournal')">
              <v-tab href="#tab-tech-journal">
                Journal
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
                API
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
  </v-container>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import ApplicationActions from '~/components/applications/actions.vue'
  import ApplicationInfo from '~/components/applications/info.vue'
  import ApplicationPublications from '~/components/applications/publications.vue'
  import ApplicationConfig from '~/components/applications/config.vue'
  import Permissions from '~/components/permissions.vue'
  import Journal from '~/components/journal.vue'
  import OpenApi from '~/components/open-api.vue'

  export default {
    components: {
      ApplicationActions,
      ApplicationInfo,
      ApplicationPublications,
      ApplicationConfig,
      Permissions,
      Journal,
      OpenApi,
    },
    async fetch({ store, params, route }) {
      await store.dispatch('application/setId', route.params.id)
    },
    data: () => ({
      showDeleteDialog: false,
      showIntegrationDialog: false,
      showCaptureDialog: false,
      showOwnerDialog: false,
      newOwner: null,
      captureWidth: 800,
      captureHeight: 450,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application', 'api', 'journal']),
      ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink']),
    },
    created() {
      // children pages are deprecated
      const path = `/application/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      this.$store.dispatch('breadcrumbs', [{ text: 'Visualisations', to: '/applications' }, { text: this.application.title || this.application.id }])
      this.subscribe()
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
</style>
