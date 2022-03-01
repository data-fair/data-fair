<template>
  <v-container
    fluid
    class="px-0"
  >
    <!--<layout-doc-link
      tooltip="Consultez la documentation sur les catalogues"
      doc-key="catalogs"
      offset="left"
    />-->
    <catalog-list v-if="user" />
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
                {{ $t('title') }}
              </h3>
              <p class="text-h6 mt-5">
                {{ $t('authRequired') }}
              </p>
              <v-btn
                color="primary"
                @click="login"
              >
                {{ $t('login') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-responsive>
    </v-col>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Catalogues
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire

en:
  title: Interoperable services
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
</i18n>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  computed: {
    ...mapState('session', ['user', 'initialized'])
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
