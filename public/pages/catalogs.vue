<template>
  <div>
    <!--<doc-link
      tooltip="Consultez la documentation sur les catalogues"
      doc-key="catalogs"
      offset="left"
    />-->
    <catalogs-list v-if="user" />
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
                {{ $t('pages.catalogs.title') }}
              </h3>
              <div class="text-h6">
                {{ $t('pages.catalogs.description') }}
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
  import { mapState, mapActions } from 'vuex'

  import CatalogsList from '~/components/catalogs/list.vue'

  export default {
    components: { CatalogsList },
    computed: {
      ...mapState('session', ['user', 'initialized']),
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
