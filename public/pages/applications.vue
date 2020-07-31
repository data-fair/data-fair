<template>
  <v-container class="pt-0" fluid>
    <v-row v-if="user">
      <v-col>
        <applications-list />
      </v-col>

      <div class="actions-buttons">
        <v-btn
          v-if="user"
          color="primary"
          fab
          small
          title="Configurer une application"
          @click="importApplicationSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importApplicationSheet">
          <import-application
            v-if="importApplicationSheet"
            :init-app="importApp"
            @cancel="importApplicationSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-row>
    <!-- Anonymous: show jumbotron -->
    <v-col
      v-else-if="initialized"
      md="6"
      offset="3"
    >
      <v-responsive>
        <v-container class="fill-height">
          <v-row align="center">
            <v-col class="text-center">
              <h3 class="display-1 mb-3 mt-5">
                {{ $t('pages.applications.title') }}
              </h3>
              <div class="text-h6">
                {{ $t('pages.applications.description') }}
              </div>
              <p class="title mt-5">
                {{ $t('common.authrequired') }}
              </p>
              <v-btn
                color="primary"
                @click="login"
              >
                {{ $t('common.login') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-responsive>
    </v-col>
  </v-container>
</template>

<script>
  import { mapState, mapActions } from 'vuex'

  import ImportApplication from '~/components/applications/import.vue'
  import ApplicationsList from '~/components/applications/list.vue'

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
      },
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
