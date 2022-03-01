<template>
  <v-container
    fluid
    class="px-0"
  >
    <dataset-list v-if="user" />
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
              <layout-wrap-svg
                :source="dataSvg"
                :color="$vuetify.theme.themes.light.primary"
              />
              <div class="text-h6">
                {{ $t('description') }}
              </div>
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
  title: Jeux de données
  description: Cet espace vous permet de transformer vos fichiers de données en sources interopérables que vous pouvez mettre à disposition d'autres utilisateurs ou utiliser dans des applications spécifiques.
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire

en:
  title: Datasets
  description: This page lets you transform your files into interoperable datasets that you will be able to publish for other users and to use in data visualizations.
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    dataSvg: require('~/assets/svg/Data Arranging_Two Color.svg?raw')
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters(['canContrib']),
    ...mapGetters('session', ['activeAccount'])
  },
  created () {
    this.fetchVocabulary()
    if (this.activeAccount) {
      this.fetchPublicationSites(this.activeAccount)
    }
  },
  methods: {
    ...mapActions('session', ['login']),
    ...mapActions(['fetchVocabulary', 'fetchPublicationSites'])
  }
}
</script>
