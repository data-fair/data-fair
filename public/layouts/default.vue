<template>
  <v-app :dark="$vuetify.theme.dark">
    <navigation-left :nav-context="navContext" />
    <navigation-top :nav-context="navContext" />
    <v-main>
      <nuxt />
      <notifications />
    </v-main>
  </v-app>
</template>

<script>
  import NavigationLeft from '~/components/layout/navigation-left.vue'
  import NavigationTop from '~/components/layout/navigation-top.vue'
  import Notifications from '~/components/layout/notifications.vue'
  const { mapState } = require('vuex')

  export default {
    components: { NavigationLeft, NavigationTop, Notifications },
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

  main.content {
    // background-color: white;
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

  .notification .v-snack__content {
    height: auto;
    p {
      margin-bottom: 4px;
      margin-top: 4px;
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
</style>
