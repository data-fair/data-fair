<template>
  <v-container v-if="catalog" fluid>
    <v-row class="catalog">
      <v-col>
        <v-card outlined style="min-height: 600px;">
          <v-tabs background-color="grey lighten-3">
            <v-tab href="#tab-general-info">
              <v-icon>mdi-information</v-icon>&nbsp;&nbsp;Informations
            </v-tab>
            <v-tab-item value="tab-general-info">
              <v-container fluid class="pb-0">
                <catalog-info />
              </v-container>
            </v-tab-item>

            <v-tab href="#tab-general-datasets">
              <v-icon>mdi-database</v-icon>&nbsp;&nbsp;Jeux de données
            </v-tab>
            <v-tab-item value="tab-general-datasets">
              <catalog-datasets />
            </v-tab-item>
          </v-tabs>
        </v-card>
      </v-col>
    </v-row>
    <catalog-actions />
  </v-container>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import CatalogActions from '~/components/catalogs/actions.vue'
  import CatalogInfo from '~/components/catalogs/info.vue'
  import CatalogDatasets from '~/components/catalogs/datasets.vue'

  export default {
    components: { CatalogActions, CatalogInfo, CatalogDatasets },
    async fetch({ store, params, route }) {
      await store.dispatch('catalog/setId', route.params.id)
    },
    data: () => ({
      showDeleteDialog: false,
      showOwnerDialog: false,
      newOwner: null,
      mini: false,
    }),
    computed: {
      ...mapState('catalog', ['catalog']),
      ...mapGetters('catalog', ['can']),
    },
    created() {
      // children pages are deprecated
      const path = `/catalog/${this.$route.params.id}`
      if (this.$route.path !== path) return this.$router.push(path)
      if (this.catalog) this.$store.dispatch('breadcrumbs', [{ text: 'Connecteurs', to: '/catalogs' }, { text: this.catalog.title || this.catalog.id }])
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('catalog', ['clear']),
    },
  }
</script>

<style>
.catalog .v-tab {
  font-weight: bold;
}
</style>
