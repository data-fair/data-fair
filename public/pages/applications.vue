<template>
  <v-container fluid>
    <application-list v-if="user" />
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
                :source="graphicSvg"
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
  title: Applications
  description: Vous pouvez configurer des applications qui vont utiliser vos jeux de données. Ces applications peuvent ensuite être partagées ou intégrées dans d\'autres sites web.',
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire

en:
  title: Applications
  description: You can configure data applications based on your datasets. These applications can then be shared and integrated in your websites.
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data () {
    return {
      importApplicationSheet: !!this.$route.query.import,
      graphicSvg: require('~/assets/svg/Graphics and charts_Monochromatic.svg?raw')
    }
  },
  computed: {
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters('session', ['activeAccount']),
    importApp () {
      return this.$route.query.import
    }
  },
  created () {
    if (this.activeAccount) {
      this.fetchPublicationSites(this.activeAccount)
    }
  },
  methods: {
    ...mapActions('session', ['login']),
    ...mapActions(['fetchPublicationSites'])
  }
}
</script>
