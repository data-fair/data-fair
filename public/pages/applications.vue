<template>
  <v-layout row>
    <v-layout v-if="user" column>
      <v-subheader>{{ $t('pages.applications.description') }}</v-subheader>
      <applications-list/>

      <div class="actions-buttons">
        <v-btn v-if="user" color="primary" fab title="Configurer une application" @click="importApplicationSheet = true">
          <v-icon>add</v-icon>
        </v-btn>
      </div>

      <div class="text-xs-center">
        <v-bottom-sheet v-model="importApplicationSheet">
          <import-application v-if="importApplicationSheet" :init-app="importApp" @cancel="importApplicationSheet = false"/>
        </v-bottom-sheet>
      </div>

    </v-layout>
    <!-- Anonymous: show jumbotron -->
    <v-flex v-else-if="initialized" md6 offset-xs3>
      <v-responsive>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('pages.applications.title') }}</h3>
              <div class="headline">{{ $t('pages.applications.description') }}</div>
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

import ImportApplication from '../components/ImportApplication.vue'
import ApplicationsList from '../components/ApplicationsList.vue'

export default {
  name: 'Datasets',
  components: { ImportApplication, ApplicationsList },
  data() {
    return { importApplicationSheet: !!this.$route.query.import }
  },
  computed: {
    ...mapState('session', ['user', 'initialized']),
    importApp() {
      return this.$route.query.import
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
