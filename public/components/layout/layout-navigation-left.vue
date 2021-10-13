<template>
  <v-navigation-drawer
    v-model="navContext.drawer"
    class="navigation-left"
    :style="style"
    dark
    app
    clipped
  >
    <!--<v-list class="pa-0">
      <brand-title />
      <v-divider />
    </v-list>-->
    <v-list
      v-if="user && user.adminMode"
      class="py-0"
      color="admin"
      style="background-image: none;"
      nav
    >
      <v-list-item tile color="admin">
        <v-list-item-title v-t="'admin'" />
      </v-list-item>
      <v-list-item
        :nuxt="true"
        :to="`/remote-services`"
        :class="routePrefix === 'remote' ? 'v-list-item--active' : ''"
      >
        <v-list-item-action><v-icon>mdi-cloud</v-icon></v-list-item-action>
        <v-list-item-title v-t="'services'" />
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/info`">
        <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
        <v-list-item-title v-t="'serviceInfo'" />
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/owners`">
        <v-list-item-action><v-icon>mdi-briefcase</v-icon></v-list-item-action>
        <v-list-item-title v-t="'owners'" />
      </v-list-item>

      <v-list-item :nuxt="true" :to="`/admin/errors`">
        <v-list-item-action><v-icon>mdi-alert</v-icon></v-list-item-action>
        <v-list-item-title v-t="'errors'" />
      </v-list-item>

      <v-list-item
        v-if="!env.disableApplications"
        :nuxt="true"
        :to="`/admin/base-apps`"
      >
        <v-list-item-action><v-icon>mdi-apps</v-icon></v-list-item-action>
        <v-list-item-title v-t="'applications'" />
      </v-list-item>

      <v-list-item :nuxt="true" :href="env.directoryUrl + '/admin/users'">
        <v-list-item-action><v-icon>mdi-account-supervisor</v-icon></v-list-item-action>
        <v-list-item-title v-t="'accountsManagement'" />
      </v-list-item>

      <template v-if="env.extraAdminNavigationItems">
        <v-list-item
          v-for="extra in env.extraAdminNavigationItems"
          :key="extra.id"
          :nuxt="!!extra.iframe"
          :to="extra.iframe && `/admin-extra/${extra.id}`"
          :href="extra.href"
        >
          <v-list-item-action><v-icon>{{ extra.icon }}</v-icon></v-list-item-action>
          <v-list-item-title>
            {{ typeof extra.title === 'string' ? extra.title : (extra.title[$i18n.locale] || extra.title[$i18n.defaultLocale]) }}
          </v-list-item-title>
        </v-list-item>
      </template>
      <v-divider />
    </v-list>

    <v-list nav>
      <template v-if="!missingSubscription">
        <v-list-item
          :nuxt="true"
          :to="`/`"
        >
          <v-list-item-action><v-icon>mdi-home</v-icon></v-list-item-action>
          <v-list-item-title v-t="'dashboard'" />
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :to="`/datasets`"
          :class="routePrefix === 'dataset' ? 'v-list-item--active' : ''"
        >
          <v-list-item-action><v-icon>mdi-database</v-icon></v-list-item-action>
          <v-list-item-title v-t="'datasets'" />
        </v-list-item>

        <v-list-item
          v-if="!env.disableApplications"
          :nuxt="true"
          :to="`/applications`"
          :class="routePrefix === 'application' ? 'v-list-item--active' : ''"
        >
          <v-list-item-action><v-icon>mdi-image-multiple</v-icon></v-list-item-action>
          <v-list-item-title v-t="'vizs'" />
        </v-list-item>

        <v-divider class="pb-2" />

        <v-list-item
          v-if="activeAccount && activeAccount.type === 'organization' && user.organization.role === 'admin'"
          :nuxt="true"
          dense
          :to="`/organization`"
        >
          <v-list-item-action><v-icon>mdi-account-multiple</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title v-t="'org'" />
            <v-list-item-subtitle>{{ activeAccount.name }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          v-if="canAdmin"
          :nuxt="true"
          dense
          to="/settings"
        >
          <v-list-item-action><v-icon>mdi-cog</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title>{{ $t('params') }}</v-list-item-title>
            <v-list-item-subtitle>{{ $t('paramsSub') }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          v-if="canContrib"
          :nuxt="true"
          dense
          :to="`/catalogs`"
          :class="routePrefix === 'catalog' ? 'v-list-item--active' : ''"
        >
          <v-list-item-action><v-icon>mdi-transit-connection</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title>{{ $t('catalogs') }}</v-list-item-title>
            <v-list-item-subtitle>{{ $t('catalogsSub') }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <template v-if="env.extraNavigationItems && user">
          <v-list-item
            v-for="extra in env.extraNavigationItems.filter(extra => !extra.can || (extra.can === 'contrib' && canContrib) || (extra.can === 'admin' && canAdmin))"
            :key="extra.id"
            :nuxt="!!extra.iframe"
            :to="extra.iframe && `/extra/${extra.id}`"
            dense
            :href="extra.href"
          >
            <v-list-item-action><v-icon>{{ extra.icon }}</v-icon></v-list-item-action>
            <v-list-item-content>
              <v-list-item-title>
                {{ typeof extra.title === 'string' ? extra.title : (extra.title[$i18n.locale] || extra.title[$i18n.defaultLocale]) }}
              </v-list-item-title>
              <v-list-item-subtitle v-if="extra.subtitle">
                {{ typeof extra.subtitle === 'string' ? extra.subtitle : (extra.subtitle[$i18n.locale] || extra.subtitle[$i18n.defaultLocale]) }}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </template>
      </template>
    </v-list>

    <v-footer absolute color="transparent">
      <v-spacer />
      <span class="text-caption"><a href="https://data-fair.github.io/2/" style="color: white;">Powered by Data Fair</a></span>
    </v-footer>
  </v-navigation-drawer>
</template>

<i18n lang="yaml">
fr:
  admin: Administration
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  applications: Applications
  accountsManagement: Gestion des comptes
  dashboard: Accueil
  datasets: Jeux de données
  vizs: Visualisations
  org: Gestion de l'organisation
  params: Paramètres
  paramsSub: Licences, thématiques ...
  catalogs: Catalogues
  catalogsSub: data.gouv.fr ...
en:
  admin: Administration
  services: Services
  serviceInfo: Service informations
  owners: Owners
  errors: Errors
  applications: Applications
  accountsManagement: Gestion des comptes
  dashboard: Dashboard
  datasets: Datasets
  vizs: Visualizations
  org: Manage organization
  params: Parameters
  paramsSub: Licenses, topics ...
  catalogs: Catalogs
  catalogsSub: data.gouv.fr ...
</i18n>

<script>
  import { mapState, mapGetters } from 'vuex'
  export default {
    props: ['navContext'],
    computed: {
      ...mapState(['env']),
      ...mapState('session', ['user']),
      ...mapGetters(['canAdmin', 'canContrib', 'missingSubscription', 'lightPrimary5', 'darkPrimary5']),
      ...mapGetters('session', ['activeAccount']),
      routePrefix() {
        return this.$route && this.$route.name && this.$route.name.split('-')[0]
      },
      style() {
        if (this.$vuetify.theme.dark) {
          return 'background: linear-gradient(90deg, #363636 0%, #272727 100%);'
        } else {
          return `background: linear-gradient(90deg, ${this.darkPrimary5} 0%, ${this.lightPrimary5} 100%);`
        }
      },
    },
  }
</script>
