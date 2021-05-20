<template>
  <div>
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
              <h3 class="display-1 mb-3 mt-5">
                {{ $t('pages.datasets.title') }}
              </h3>
              <layout-wrap-svg
                :source="dataSvg"
                :color="$vuetify.theme.themes.light.primary"
              />
              <div class="text-h6">
                {{ $t('pages.datasets.description') }}
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
  </div>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    data: () => ({
      dataSvg: require('~/assets/svg/Data Arranging_Two Color.svg?raw'),
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters(['canContrib']),
    },
    created() {
      this.fetchVocabulary()
    },
    methods: {
      ...mapActions('session', ['login']),
      ...mapActions(['fetchVocabulary']),
    },
  }
</script>
