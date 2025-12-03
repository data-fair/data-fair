<template>
  <v-app
    :dark="$vuetify.theme.dark"
    :class="`data-fair ${siteInfo.main ? 'main-site' : 'secondary-site'}`"
  >
    <v-main v-if="error">
      <v-container>
        <v-alert
          type="error"
          outlined
          dense
        >
          {{ error }}
        </v-alert>
      </v-container>
    </v-main>
    <template v-else>
      <layout-navigation-left :nav-context="navContext" />
      <layout-navigation-top :nav-context="navContext" />
      <v-main>
        <nuxt />
        <layout-notifications />
      </v-main>
    </template>
  </v-app>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  data: () => ({
    navContext: {
      drawer: false
    }
  }),
  head () {
    const scrollMode = this.$route.name === 'application-id-config' ? 'hidden' : 'scroll'
    return {
      htmlAttrs: { lang: this.$i18n.locale }, // TODO: this should be set by nuxt-i18n but it isn't for some reason
      style: [{ vmid: 'dynamic-style', cssText: this.$store.getters.style(scrollMode), type: 'text/css' }],
      __dangerouslyDisableSanitizers: ['style']
    }
  },
  computed: {
    ...mapState(['siteInfo']),
    ...mapGetters('session', ['activeAccount']),
    error () {
      if (!this.siteInfo.main && !this.siteInfo.isAccountMain) {
        return 'Le back-office n\'est pas accessible depuis ce domaine.'
      }
      if (!this.siteInfo.main) {
        if (this.activeAccount && (this.activeAccount.type !== this.siteInfo.owner.type || this.activeAccount.id !== this.siteInfo.owner.id)) {
          return `Le back-office est accessible uniquement aux membres de ${this.siteInfo.owner.name} (${this.siteInfo.owner.id}).`
        }
      }
      return null
    }
  },
  mounted () {
    if (!this.$vuetify.breakpoint.mobile) this.navContext.drawer = true
  }
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
