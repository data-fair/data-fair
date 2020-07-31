<template>
  <v-navigation-drawer
    color="primary"
    dark
    app
    permanent
  >
    <v-list-item :href="env.brand.url || env.publicUrl">
      <v-list-item-action>
        <div class="main-logo">
          <img v-if="env.brand.logo" :src="env.brand.logo">
          <img v-else src="~/assets/logo.svg">
        </div>
      </v-list-item-action>
      <v-list-item-title><h1>{{ env.brand.title || 'DataFair' }}</h1></v-list-item-title>
    </v-list-item>
    <v-divider />

    <v-list
      v-if="user && user.adminMode"
      color="admin"
      tile
      class="py-0 my-2"
    >
      <v-list-item tile>
        <v-list-item-title>Administration</v-list-item-title>
      </v-list-item>
      <v-list-item
        :nuxt="true"
        :to="`/remote-services`"
        :class="routePrefix === 'remote-service' ? 'v-list-item--active' : ''"
      >
        <v-list-item-action><v-icon>mdi-cloud</v-icon></v-list-item-action>
        <v-list-item-title>Services</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/info`">
        <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
        <v-list-item-title>Informations du service</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/owners`">
        <v-list-item-action><v-icon>mdi-briefcase</v-icon></v-list-item-action>
        <v-list-item-title>Propriétaires</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/errors`">
        <v-list-item-action><v-icon>mdi-alert</v-icon></v-list-item-action>
        <v-list-item-title>Erreurs</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/base-apps`">
        <v-list-item-action><v-icon>mdi-apps</v-icon></v-list-item-action>
        <v-list-item-title>Applications</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" :href="env.directoryUrl + '/admin/users'">
        <v-list-item-action><v-icon>mdi-account-supervisor</v-icon></v-list-item-action>
        <v-list-item-title>Gestion des comptes</v-list-item-title>
      </v-list-item>
    </v-list>

    <v-list class="pt-0">
      <v-list-item
        :nuxt="true"
        :to="`/datasets`"
        :class="routePrefix === 'dataset' ? 'v-list-item--active' : ''"
      >
        <v-list-item-action><v-icon>mdi-database</v-icon></v-list-item-action>
        <v-list-item-title>Jeux de données</v-list-item-title>
      </v-list-item>

      <v-list-item
        :nuxt="true"
        :to="`/applications`"
        :class="routePrefix === 'application' ? 'v-list-item--active' : ''"
      >
        <v-list-item-action><v-icon>mdi-image-multiple</v-icon></v-list-item-action>
        <v-list-item-title>Visualisations</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" to="/settings">
        <v-list-item-action><v-icon>mdi-cog</v-icon></v-list-item-action>
        <v-list-item-title>Paramètres</v-list-item-title>
      </v-list-item>

      <v-list-item :nuxt="true" to="/storage">
        <v-list-item-action><v-icon>mdi-harddisk</v-icon></v-list-item-action>
        <v-list-item-title>Stockage</v-list-item-title>
      </v-list-item>

      <v-list-item
        :nuxt="true"
        :to="`/catalogs`"
        :class="routePrefix === 'catalog' ? 'v-list-item--active' : ''"
      >
        <v-list-item-action><v-icon>mdi-transit-connection</v-icon></v-list-item-action>
        <v-list-item-title>Connecteurs</v-list-item-title>
      </v-list-item>
    </v-list>

    <v-footer absolute color="transparent">
      <v-spacer />
      <span class="caption">Maintenu par&nbsp;<a href="https://koumoul.com" style="color: white;">Koumoul</a></span>
    </v-footer>
  </v-navigation-drawer>
</template>

<script>
  import { mapState } from 'vuex'
  export default {
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user']),
      routePrefix() {
        return this.$route && this.$route.name && this.$route.name.split('-')[0]
      },
    },
  }
</script>

<style lang="css" scoped>
.main-logo img {
  width: 40px;
  height: auto;
}
</style>
