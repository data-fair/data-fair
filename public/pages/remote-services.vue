<template>
  <v-layout row>
    <div v-if="user">
      <v-subheader>{{ $t('pages.services.description') }}</v-subheader>
      <remote-services-list/>

      <div class="actions-buttons">
        <v-btn v-if="user" color="primary" fab title="Configurer un service" @click="importServiceSheet = true">
          <v-icon>add</v-icon>
        </v-btn>
      </div>
      <template>
        <div class="text-xs-center">
          <v-bottom-sheet v-model="importServiceSheet">
            <import-remote-service v-if="importServiceSheet" :init-service="importService" @cancel="importServiceSheet = false"/>
          </v-bottom-sheet>
        </div>
      </template>
    </div>
    <!-- Anonymous: show jumbotron -->
    <v-flex v-else md6 offset-xs3>
      <v-jumbotron>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.services.title') }}</h3>
              <div class="headline">{{ $t('pages.services.description') }}</div>
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

import ImportRemoteService from '../components/ImportRemoteService.vue'
import RemoteServicesList from '../components/RemoteServicesList.vue'

export default {
  name: 'Datasets',
  components: { ImportRemoteService, RemoteServicesList },
  data() {
    return { importServiceSheet: !!this.$route.query.import }
  },
  computed: {
    ...mapState('session', ['user']),
    importService() {
      return this.$route.query.import
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
