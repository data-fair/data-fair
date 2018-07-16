<template>
  <v-layout row>

    <catalogs-list/>

    <div class="actions-buttons">
      <v-btn v-if="user" @click="importCatalogSheet = true" color="primary" fab title="Configurer un catalogue">
        <v-icon>add</v-icon>
      </v-btn>
    </div>
    <template>
      <div class="text-xs-center">
        <v-bottom-sheet v-model="importCatalogSheet">
          <import-catalog v-if="importCatalogSheet" @cancel="importCatalogSheet = false" :init-catalog="importCatalog"/>
        </v-bottom-sheet>
      </div>
    </template>
  </v-layout>
</template>

<script>
import {mapState} from 'vuex'

import ImportCatalog from '../components/ImportCatalog.vue'
import CatalogsList from '../components/CatalogsList.vue'

export default {
  name: 'Datasets',
  components: {ImportCatalog, CatalogsList},
  data() {
    return {importCatalogSheet: !!this.$route.query.import}
  },
  computed: {
    ...mapState('session', ['user']),
    importCatalog() {
      return this.$route.query.import
    }
  }
}
</script>
