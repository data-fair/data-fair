<template>
  <v-container fluid class="px-0">
    <remote-service-list v-if="user" />
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
              <h3 class="text-h4 mb-3 mt-5">
                {{ $t('pages.services.title') }}
              </h3>
              <div class="text-h6">
                {{ $t('pages.services.description') }}
              </div>
              <p class="text-h6 mt-5">
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

  export default {
    computed: {
      ...mapState('session', ['user', 'initialized']),
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
