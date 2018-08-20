<template>
  <v-layout row>
    <div v-if="user">
      <v-subheader>{{ $t('pages.applications.description') }}</v-subheader>
      <applications-list/>

      <div class="actions-buttons">
        <v-btn v-if="user" @click="importApplicationSheet = true" color="primary" fab title="Configurer une application">
          <v-icon>add</v-icon>
        </v-btn>
      </div>
      <template>
        <div class="text-xs-center">
          <v-bottom-sheet v-model="importApplicationSheet">
            <import-application v-if="importApplicationSheet" @cancel="importApplicationSheet = false" :init-app="importApp"/>
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
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.applications.title') }}</h3>
              <div class="headline">{{ $t('pages.applications.description') }}</div>
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

import ImportApplication from '../components/ImportApplication.vue'
import ApplicationsList from '../components/ApplicationsList.vue'

export default {
  name: 'Datasets',
  components: {ImportApplication, ApplicationsList},
  data() {
    return {importApplicationSheet: !!this.$route.query.import}
  },
  computed: {
    ...mapState('session', ['user']),
    importApp() {
      return this.$route.query.import
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
