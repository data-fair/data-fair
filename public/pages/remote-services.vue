<template>
  <v-container class="pt-0" fluid>
    <v-row v-if="user">
      <v-col>
        <v-subheader class="px-0">
          {{ $t('pages.services.description') }}
        </v-subheader>
        <remote-services-list />
      </v-col>

      <div class="actions-buttons">
        <v-btn
          v-if="user"
          color="primary"
          fab
          title="Configurer un service"
          @click="importServiceSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importServiceSheet">
          <import-remote-service
            v-if="importServiceSheet"
            :init-service="importService"
            @cancel="importServiceSheet = false"
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
                {{ $t('pages.services.title') }}
              </h3>
              <div class="headline">
                {{ $t('pages.services.description') }}
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

  import ImportRemoteService from '~/components/remote-services/import.vue'
  import RemoteServicesList from '~/components/remote-services/list.vue'

  export default {
    name: 'Datasets',
    components: { ImportRemoteService, RemoteServicesList },
    data() {
      return { importServiceSheet: !!this.$route.query.import }
    },
    computed: {
      ...mapState('session', ['user', 'initialized']),
      importService() {
        return this.$route.query.import
      },
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
