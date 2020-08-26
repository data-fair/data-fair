<template>
  <v-container class="pt-0" fluid>
    <doc-link
      tooltip="Consultez la documentation sur les connecteurs"
      doc-key="catalogs"
      offset="left"
    />
    <v-row v-if="user">
      <v-col>
        <v-subheader class="px-0 pr-12 mb-2">
          {{ $t('pages.catalogs.description') }}
        </v-subheader>
        <catalogs-list />
      </v-col>

      <div class="actions-buttons">
        <v-btn
          v-if="user && canAdmin"
          color="primary"
          fab
          small
          title="Configurer un catalogue"
          @click="importCatalogSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importCatalogSheet">
          <import-catalog
            v-if="importCatalogSheet"
            :init-catalog="importCatalog"
            @cancel="importCatalogSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-row>
    <!-- Anonymous: show jumbotron -->
    <v-col
      v-else-if="initialized"
      md="6"
      offset="3"
    >
      <v-responsive>
        <v-container class="fill-height">
          <v-row align="center">
            <v-col class="text-center">
              <h3 class="display-1 mb-3 mt-5">
                {{ $t('pages.catalogs.title') }}
              </h3>
              <div class="text-h6">
                {{ $t('pages.catalogs.description') }}
              </div>
              <p class="title mt-5">
                {{ $t('common.authrequired') }}
              </p>
              <v-btn
                color="primary"
                @click="login"
              >
                {{ $t('common.login') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-responsive>
    </v-col>
  </v-container>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  import ImportCatalog from '~/components/catalogs/import.vue'
  import CatalogsList from '~/components/catalogs/list.vue'

  export default {
    components: { ImportCatalog, CatalogsList },
    data() {
      return { importCatalogSheet: !!this.$route.query.import }
    },
    computed: {
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters(['canAdmin']),
      importCatalog() {
        return this.$route.query.import
      },
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
