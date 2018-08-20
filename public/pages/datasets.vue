<template>
  <v-layout row>
    <div v-if="user">
      <v-subheader>{{ $t('pages.datasets.description') }}</v-subheader>
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
    </div>
    <!-- Anonymous: show jumbotron -->
    <v-flex md6 offset-xs3 v-else>
      <v-jumbotron>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.datasets.title') }}</h3>
              <div class="headline">{{ $t('pages.datasets.description') }}</div>
              <p class="title mt-5">{{ $t('common.authrequired') }}</p>
              <v-btn @click="login" color="primary">{{ $t('common.login') }}</v-btn>
            </v-flex>
          </v-layout>
        </v-container>
      </v-jumbotron>
    </v-flex>
  </v-layout>
</template>

<script>
import {mapState, mapActions} from 'vuex'

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
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
