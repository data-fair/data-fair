<template>
  <v-layout row>

    <datasets-list/>

    <div class="actions-buttons">
      <v-btn v-if="user" @click="importFileSheet = true" color="primary" fab title="Importer un fichier">
        <v-icon>file_upload</v-icon>
      </v-btn>
    </div>
    <template>
      <div class="text-xs-center">
        <v-bottom-sheet v-model="importFileSheet">
          <import-file v-if="importFileSheet" @cancel="importFileSheet = false"/>
        </v-bottom-sheet>
      </div>
    </template>
  </v-layout>
</template>

<script>
import {mapState} from 'vuex'

import ImportFile from '../components/ImportFile.vue'
import DatasetsList from '../components/DatasetsList.vue'

export default {
  name: 'Datasets',
  components: {ImportFile, DatasetsList},
  data() {
    return {importFileSheet: false}
  },
  computed: {
    ...mapState('session', ['user'])
  }
}
</script>
