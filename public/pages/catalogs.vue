<template>
  <v-layout row>
    <v-layout v-if="user" column>
      <v-subheader>{{ $t('pages.catalogs.description') }}</v-subheader>
      <catalogs-list/>

      <div class="actions-buttons">
        <v-btn v-if="user" color="primary" fab title="Configurer un catalogue" @click="importCatalogSheet = true">
          <v-icon>add</v-icon>
        </v-btn>
      </div>

      <div class="text-xs-center">
        <v-bottom-sheet v-model="importCatalogSheet">
          <import-catalog v-if="importCatalogSheet" :init-catalog="importCatalog" @cancel="importCatalogSheet = false"/>
        </v-bottom-sheet>
      </div>

    </v-layout>
    <!-- Anonymous: show jumbotron -->
    <v-flex v-else-if="initialized" md6 offset-xs3>
      <v-jumbotron>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.catalogs.title') }}</h3>
              <div class="headline">{{ $t('pages.catalogs.description') }}</div>
              <p class="title mt-5">{{ $t('common.authrequired') }}</p>
              <v-btn color="primary" @click="login">{{ $t('common.login') }}</v-btn>
            </v-flex>
          </v-layout>
        </v-container>
      </v-jumbotron>
    </v-flex>
  </v-layout>
</template>

<script>
import { mapState, mapActions } from 'vuex'

import ImportCatalog from '../components/ImportCatalog.vue'
import CatalogsList from '../components/CatalogsList.vue'

export default {
  components: { ImportCatalog, CatalogsList },
  data() {
    return { importCatalogSheet: !!this.$route.query.import }
  },
  computed: {
    ...mapState('session', ['user', 'initialized']),
    importCatalog() {
      return this.$route.query.import
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
