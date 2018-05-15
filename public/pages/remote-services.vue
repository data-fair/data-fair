<template>
  <v-layout row>

    <remote-services-list/>

    <div class="actions-buttons">
      <v-btn v-if="user" @click="importServiceSheet = true" color="primary" fab title="Configurer un service">
        <v-icon>add</v-icon>
      </v-btn>
    </div>
    <template>
      <div class="text-xs-center">
        <v-bottom-sheet v-model="importServiceSheet">
          <import-remote-service v-if="importServiceSheet" @cancel="importServiceSheet = false" :init-service="importService"/>
        </v-bottom-sheet>
      </div>
    </template>
  </v-layout>
</template>

<script>
import {mapState} from 'vuex'

import ImportRemoteService from '../components/ImportRemoteService.vue'
import RemoteServicesList from '../components/RemoteServicesList.vue'

export default {
  name: 'Datasets',
  components: {ImportRemoteService, RemoteServicesList},
  data() {
    return {importServiceSheet: !!this.$route.query.import}
  },
  computed: {
    ...mapState('session', ['user']),
    importService() {
      return this.$route.query.import
    }
  }
}
</script>
