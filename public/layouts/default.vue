<template>
  <v-app :dark="$vuetify.theme.dark" class="data-fair">
    <layout-dynamic-style html-overflow="scroll" />
    <layout-navigation-left :nav-context="navContext" />
    <layout-navigation-top :nav-context="navContext" />
    <v-main>
      <nuxt />
      <layout-notifications />
    </v-main>
  </v-app>
</template>

<script>
  const { mapState } = require('vuex')

  export default {
    data: () => ({
      navContext: {
        drawer: false,
      },
    }),
    computed: {
      ...mapState(['env']),
    },
    mounted() {
      if (!this.$vuetify.breakpoint.mobile) this.navContext.drawer = true
    },
  }

</script>

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
    top: 70px;
    right: 8px;
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
</style>
