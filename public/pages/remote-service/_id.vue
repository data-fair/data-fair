<template>
  <v-container v-if="remoteService" fluid>
    <v-row class="remoteService">
      <v-col>
        <v-card outlined style="min-height: 330px;">
          <v-tabs :background-color="$vuetify.theme.dark ? '' : 'grey lighten-3'">
            <v-tab href="#tab-general-info">
              Informations
            </v-tab>
            <v-tab-item value="tab-general-info">
              <v-container fluid>
                <remote-service-info />
              </v-container>
            </v-tab-item>

            <v-tab href="#tab-general-schema">
              Schéma
            </v-tab>
            <v-tab-item value="tab-general-schema">
              <remote-service-schema />
            </v-tab-item>
          </v-tabs>
        </v-card>

        <v-card outlined class="mt-4">
          <v-tabs :background-color="$vuetify.theme.dark ? '' : 'grey lighten-3'">
            <v-tab href="#tab-tech-config">
              Configuration
            </v-tab>
            <v-tab-item value="tab-tech-config">
              <remote-service-config />
            </v-tab-item>

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
          </v-tabs>
        </v-card>
      </v-col>

      <remote-service-actions />
    </v-row>
  </v-container>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import RemoteServiceActions from '~/components/remote-services/actions.vue'
  import RemoteServiceInfo from '~/components/remote-services/info.vue'
  import RemoteServiceSchema from '~/components/remote-services/schema.vue'
  import RemoteServiceConfig from '~/components/remote-services/config.vue'
  import OpenApi from '~/components/open-api.vue'

  export default {
    components: { RemoteServiceActions, RemoteServiceInfo, RemoteServiceSchema, RemoteServiceConfig, OpenApi },
    async fetch({ store, params, route }) {
      await Promise.all([
        store.dispatch('remoteService/setId', route.params.id),
        store.dispatch('fetchVocabulary'),
      ])
    },
    computed: {
      ...mapState('session', ['user']),
      ...mapState('remoteService', ['remoteService', 'api']),
      ...mapGetters('remoteService', ['resourceUrl']),
    },
    created() {
      // children pages are deprecated
      const path = `/remote-service/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      this.$store.dispatch('breadcrumbs', [{ text: 'Services', to: '/remote-services' }, { text: this.remoteService.title || this.remoteService.id }])
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('remoteService', ['patch', 'remove', 'clear', 'refresh']),
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
