<template>
  <v-layout row>
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
  </v-layout>
</template>

<script>
import {mapState} from 'vuex'

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
  }
}
</script>
