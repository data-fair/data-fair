<template>
  <v-app
    :dark="$vuetify.theme.dark"
    class="data-fair"
  >
    <layout-dynamic-style html-overflow="scroll" />
    <template v-if="isMainDomain">
      <layout-navigation-left :nav-context="navContext" />
      <layout-navigation-top :nav-context="navContext" />
      <v-main>
        <nuxt />
        <layout-notifications />
      </v-main>
    </template>
    <v-container v-else>
      <v-alert
        v-t="'wrongDomain'"
        type="error"
      />
    </v-container>
  </v-app>
</template>

<script>
const { mapState } = require('vuex')

export default {
  data: () => ({
    navContext: {
      drawer: false
    }
  }),
  computed: {
    ...mapState(['env']),
    isMainDomain () {
      return this.env.mainPublicUrl.startsWith(window.location.origin)
    }
  },
  mounted () {
    if (!this.$vuetify.breakpoint.mobile) this.navContext.drawer = true
  }
}

</script>

<i18n lang="yaml">
fr:
  wrongDomain: Cette page n'est pas consultable depuis ce domaine.
en:
  wrongDomain: This page cannot be accessed from this domain.
</i18n>

<style lang="less">

body .v-application {
  .logo-container {
    height: 100%;
    padding: 4px;
    margin-left: 4px !important;
    margin-right: 4px;

    img {
      height:100%;
    }
  }

  .main-toolbar-light {
    background-color: white;
  }

  .main-toolbar {
    .v-toolbar__content {
      padding-left: 0;
    }
  }

  .actions-buttons {
    position: fixed;
    top: 54px;
    right: 6px;
    margin: 0;

    .v-btn {
      margin-bottom: 16px;
    }
  }
}

.event-finalize-end * {}

.event-publication * {}

.event-error {
  .v-list__tile {
    height: auto;
  }
  p {
    margin-bottom: 0;
  }
}

iframe {
  background-color: transparent;
  border: none;
}

.v-list.list-actions .v-list-item .v-list-item__icon {
  margin-right: 16px;
}

.theme--dark.v-tabs-items {
  background-color: transparent!important;
}
</style>
