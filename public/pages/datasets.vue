<template>
  <v-layout row>
    <v-layout v-if="user" column>
      <v-subheader>{{ $t('pages.datasets.description') }}</v-subheader>
      <datasets-list/>

      <div class="actions-buttons">
        <v-menu v-if="user" bottom left>
          <v-btn slot="activator" fab color="primary" title="Créer un jeu de données">
            <v-icon>add</v-icon>
          </v-btn>
          <v-list>
            <v-list-tile @click="importFileSheet = true">
              <v-list-tile-avatar>
                <v-icon color="primary">file_upload</v-icon>
              </v-list-tile-avatar>
              <v-list-tile-title>Importer un fichier</v-list-tile-title>
            </v-list-tile>
            <v-list-tile @click="createVirtualSheet = true">
              <v-list-tile-avatar>
                <v-icon color="primary">picture_in_picture</v-icon>
              </v-list-tile-avatar>
              <v-list-tile-title>Créer un jeu virtuel</v-list-tile-title>
            </v-list-tile>
            <v-list-tile @click="createRestSheet = true">
              <v-list-tile-avatar>
                <v-icon color="primary">all_inclusive</v-icon>
              </v-list-tile-avatar>
              <v-list-tile-title>Créer un jeu incrémental</v-list-tile-title>
            </v-list-tile>
          </v-list>
        </v-menu>
      </div>

      <div class="text-xs-center">
        <v-bottom-sheet v-model="importFileSheet">
          <import-file v-if="importFileSheet" @cancel="importFileSheet = false"/>
        </v-bottom-sheet>
        <v-bottom-sheet v-model="createVirtualSheet">
          <create-virtual v-if="createVirtualSheet" @cancel="createVirtualSheet = false"/>
        </v-bottom-sheet>
        <v-bottom-sheet v-model="createRestSheet">
          <create-rest v-if="createRestSheet" @cancel="createRestSheet = false"/>
        </v-bottom-sheet>
      </div>

    </v-layout>
    <!-- Anonymous: show jumbotron -->
    <v-flex v-else-if="initialized" md6 offset-xs3>
      <v-responsive>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.datasets.title') }}</h3>
              <div class="headline">{{ $t('pages.datasets.description') }}</div>
              <p class="title mt-5">{{ $t('common.authrequired') }}</p>
              <v-btn color="primary" @click="login">{{ $t('common.login') }}</v-btn>
            </v-flex>
          </v-layout>
        </v-container>
      </v-responsive>
    </v-flex>
  </v-layout>
</template>

<script>
import { mapState, mapActions } from 'vuex'

import ImportFile from '../components/ImportFile.vue'
import CreateVirtual from '../components/CreateVirtual.vue'
import CreateRest from '../components/CreateRest.vue'
import DatasetsList from '../components/DatasetsList.vue'

export default {
  name: 'Datasets',
  components: { ImportFile, CreateVirtual, CreateRest, DatasetsList },
  data() {
    return { importFileSheet: false, createVirtualSheet: false, createRestSheet: false }
  },
  computed: {
    ...mapState('session', ['user', 'initialized'])
  },
  created() {
    this.fetchVocabulary()
  },
  methods: {
    ...mapActions('session', ['login']),
    ...mapActions(['fetchVocabulary'])
  }
}
</script>
