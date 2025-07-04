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
      nav
      class="px-1 pt-1 pb-0"
    >
      <v-list-item
        v-if="missingSubscription && canAdmin && env.subscriptionUrl"
        :nuxt="true"
        :to="`/subscription`"
      >
        <v-list-item-action><v-icon>mdi-card-account-details</v-icon></v-list-item-action>
        <v-list-item-title v-t="'subscription'" />
      </v-list-item>

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
          <v-list-item-content>
            <v-list-item-title v-t="'applications'" />
            <v-list-item-subtitle v-t="'applicationsSubtitle'" />
          </v-list-item-content>
        </v-list-item>

        <v-divider class="pb-1" />

        <v-list-item
          v-if="activeAccount && activeAccount.type === 'organization' && user.organization.role === 'admin' && !user.organization.department"
          :nuxt="true"
          dense
          :to="`/organization`"
        >
          <v-list-item-action><v-icon>mdi-account-group</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title v-t="'org'" />
            <v-list-item-subtitle>{{ activeAccount.name }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          v-if="activeAccount && activeAccount.type === 'organization' && user.organization.role === 'admin' && user.organization.department"
          :nuxt="true"
          dense
          :to="`/department`"
        >
          <v-list-item-action><v-icon>mdi-account-group</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title v-t="'dep'" />
            <v-list-item-subtitle>{{ activeAccount.name }} / {{ user.organization.departmentName || user.organization.department }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          v-if="canAdmin && env.subscriptionUrl"
          :nuxt="true"
          :to="`/subscription`"
        >
          <v-list-item-action><v-icon>mdi-card-account-details</v-icon></v-list-item-action>
          <v-list-item-title v-t="'subscription'" />
        </v-list-item>

        <v-list-item
          v-if="canAdminDep"
          :nuxt="true"
          dense
          to="/settings"
        >
          <v-list-item-action><v-icon>mdi-cog</v-icon></v-list-item-action>
          <v-list-item-content>
            <v-list-item-title>{{ $t('params') }}</v-list-item-title>
            <v-list-item-subtitle v-if="!activeAccount.department">
              {{ $t('paramsSub') }}
            </v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          v-if="canContrib"
          :nuxt="true"
          dense
          to="/storage"
        >
          <v-list-item-action><v-icon>mdi-harddisk</v-icon></v-list-item-action>
          <v-list-item-title v-t="'storage'" />
        </v-list-item>

        <v-list-item
          v-if="canAdminDep"
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
            v-for="extra in env.extraNavigationItems.filter(extra => !extra.can || (extra.can === 'contrib' && canContrib) || (extra.can === 'admin' && canAdmin) || (extra.can === 'contribDep' && canContribDep) || (extra.can === 'adminDep' && canAdminDep))"
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

    <v-list
      v-if="!missingSubscription"
      nav
      class="px-1 pt-0 pb-1"
      dense
    >
      <v-list-group
        v-if="canContribDep"
        color="white"
        :value="$route.path === '/api-doc'"
      >
        <template #activator>
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title v-t="'doc'" />
        </template>
        <v-list-item
          :nuxt="true"
          dense
          to="/api-doc"
        >
          <v-list-item-action><v-icon>mdi-cloud</v-icon></v-list-item-action>
          <v-list-item-title v-t="'apiDoc'" />
        </v-list-item>
        <!--<v-list-item
          :nuxt="true"
          dense
          href="https://data-fair.github.io/4/user-guide-backoffice"
          target="blank"
        >
          <v-list-item-action><v-icon>mdi-book-open-variant</v-icon></v-list-item-action>
          <v-list-item-title v-t="'userDoc'" />
        </v-list-item>-->
        <v-list-item
          v-for="(docLink, i) of env.extraDocLinks"
          :key="i"
          :nuxt="true"
          dense
          :href="docLink.href"
          target="blank"
        >
          <v-list-item-action><v-icon>{{ docLink.icon }}</v-icon></v-list-item-action>
          <v-list-item-title>{{ docLink.title }}</v-list-item-title>
        </v-list-item>
      </v-list-group>
    </v-list>

    <v-list
      v-if="user && user.adminMode"
      nav
      class="px-1 pt-0 pb-1"
      dense
    >
      <v-divider class="pb-1" />
      <v-list-group
        :style="`background-color:${$vuetify.theme.themes.light.admin}`"
        color="white"
        :value="$route.path.startsWith('/admin') || $route.path.startsWith('/remote-services')"
      >
        <template #activator>
          <v-list-item-action><v-icon>mdi-shield-star</v-icon></v-list-item-action>
          <v-list-item-title v-t="'admin'" />
        </template>

        <v-list-item
          :nuxt="true"
          :to="`/admin/info`"
        >
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title v-t="'serviceInfo'" />
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :to="`/remote-services`"
          :class="routePrefix === 'remote' ? 'v-list-item--active' : ''"
        >
          <v-list-item-action><v-icon>mdi-cloud</v-icon></v-list-item-action>
          <v-list-item-title v-t="'services'" />
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :to="`/admin/owners`"
        >
          <v-list-item-action><v-icon>mdi-briefcase</v-icon></v-list-item-action>
          <v-list-item-title v-t="'owners'" />
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :to="`/admin/errors`"
        >
          <v-list-item-action><v-icon>mdi-alert</v-icon></v-list-item-action>
          <v-list-item-title v-t="'errors'" />
        </v-list-item>

        <v-list-item
          v-if="!env.disableApplications"
          :nuxt="true"
          :to="`/admin/base-apps`"
        >
          <v-list-item-action><v-icon>mdi-apps</v-icon></v-list-item-action>
          <v-list-item-title v-t="'baseApplications'" />
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :href="env.directoryUrl + '/admin/users'"
        >
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
      </v-list-group>
    </v-list>

    <v-footer
      absolute
      color="transparent"
    >
      <v-spacer />
      <span class="text-caption"><a
        href="https://data-fair.github.io/4/"
        style="color:white;"
      >Powered by Data Fair</a></span>
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
  baseApplications: Modèles d'application
  applications: Applications
  applicationsSubtitle: Visualisations, formulaires ...
  accountsManagement: Gestion des comptes
  dashboard: Accueil
  datasets: Jeux de données
  vizs: Applications
  org: Gestion de l'organisation
  dep: Gestion du département
  params: Paramètres
  paramsSub: Licences, thématiques ...
  catalogs: Catalogues
  catalogsSub: Ancienne version
  storage: Stockage
  subscription: Abonnement
  doc: Documentation
  apiDoc: Utiliser l'API
  userDoc: Manuel utilisateur
en:
  admin: Administration
  services: Services
  serviceInfo: Service informations
  owners: Owners
  errors: Errors
  baseApplications: Application models
  applications: Applications
  applicationsSubtitle: Visualizations, forms ...
  accountsManagement: Gestion des comptes
  dashboard: Dashboard
  datasets: Datasets
  vizs: Applications
  org: Manage organization
  dep: Manage department
  params: Parameters
  paramsSub: Licenses, topics ...
  catalogs: Catalogs
  catalogsSub: Old version
  storage: Storage
  subscription: Subscription
  doc: Documentation
  apiDoc: Use the API
  userDoc: User manual
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
  props: ['navContext'],
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user']),
    ...mapGetters(['canAdmin', 'canContrib', 'canAdminDep', 'canContribDep', 'missingSubscription', 'lightPrimary10', 'darkPrimary10']),
    ...mapGetters('session', ['activeAccount']),
    routePrefix () {
      return this.$route && this.$route.name && this.$route.name.split('-')[0]
    },
    style () {
      return `background: linear-gradient(${this.$vuetify.theme.dark ? '90' : '270'}deg,  ${this.lightPrimary10} 0%, ${this.darkPrimary10} 100%);`
    }
  }
}
</script>

<style>
.navigation-left .v-list-item__action {
  margin-right: 16px !important;
}
.navigation-left .v-list-item {
  margin-bottom: 4px !important;
}
</style>
