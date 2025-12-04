<template>
  <v-navigation-drawer
    v-model="navContext.drawer"
    class="navigation-left"
    :style="style"
    dark
    app
    clipped
    color="primary"
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
        <template v-for="(item, i) of navigation">
          <template v-if="item.group">
            <v-list-group
              v-if="item.items.length"
              :key="item.group"
              color="white"
              :style="item.style"
              :value="activeGroup === item.group"
            >
              <template #activator>
                <v-list-item-title>{{ item.title }}</v-list-item-title>
              </template>

              <v-list-item
                v-for="(child,j) of item.items"
                :key="j"
                :nuxt="true"
                :to="child.to"
                class="ml-3"
              >
                <v-list-item-action><v-icon>{{ child.icon }}</v-icon></v-list-item-action>
                <v-list-item-content>
                  <v-list-item-title>{{ child.title }}</v-list-item-title>
                  <v-list-item-subtitle v-if="child.subtitle">{{ child.subtitle }}</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list-group>
          </template>
          <v-list-item
            v-else
            :key="i"
            :nuxt="true"
            :to="item.to"
          >
            <v-list-item-action><v-icon>{{ item.icon }}</v-icon></v-list-item-action>
            <v-list-item-content>
              <v-list-item-title>{{ item.title }}</v-list-item-title>
              <v-list-item-subtitle v-if="item.subtitle">{{ item.subtitle }}</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </template>
      </template>
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
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  baseApplications: Modèles d'application
  applications: Applications
  applicationsSubtitle: Visualisations, formulaires ...
  accountsManagement: Gestion des comptes
  home: Accueil
  datasets: Jeux de données
  vizs: Applications
  org: Gestion de l'organisation
  dep: Gestion du département
  params: Paramètres
  paramsSub: Licences, thématiques ...
  catalogs: Catalogues distants
  catalogsPlugins: Plugins - Catalogues
  storage: Stockage
  subscription: Abonnement
  doc: Documentation
  apiDoc: Utiliser l'API
  userDoc: Manuel utilisateur
  group:
    content: Contenus
    management: Gestion
    connect: Connecteurs
    monitor: Suivi
    support: Support
    admin: Administration
en:
  services: Services
  serviceInfo: Service informations
  owners: Owners
  errors: Errors
  baseApplications: Application models
  applications: Applications
  applicationsSubtitle: Visualizations, forms ...
  accountsManagement: Gestion des comptes
  home: Home
  datasets: Datasets
  vizs: Applications
  org: Manage organization
  dep: Manage department
  params: Parameters
  paramsSub: Licenses, topics ...
  catalogs: Remote catalogs
  catalogsPlugins: Plugins - Catalogs
  storage: Storage
  subscription: Subscription
  doc: Documentation
  apiDoc: Use the API
  userDoc: User manual
  group:
    content: Contents
    management: Management
    connect: Connectors
    monitor: Monitoring
    support: Support
    admin: Administration
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
export default {
  props: ['navContext'],
  computed: {
    ...mapState(['env', 'siteInfo']),
    ...mapState('session', ['user']),
    ...mapGetters(['canAdmin', 'canContrib', 'canAdminDep', 'canContribDep', 'missingSubscription', 'lightPrimary10', 'darkPrimary10']),
    ...mapGetters('session', ['activeAccount']),
    routePrefix () {
      return this.$route && this.$route.name && this.$route.name.split('-')[0]
    },
    style () {
      if (!this.siteInfo.main) return ''
      return `background: linear-gradient(${this.$vuetify.theme.dark ? '90' : '270'}deg,  ${this.lightPrimary10} 0%, ${this.darkPrimary10} 100%);`
    },
    extraNavigationItems () {
      return this.env.extraNavigationItems.filter(extra => {
        if (extra.mainOnly && !this.siteInfo.main) return false
        return !extra.can || (extra.can === 'contrib' && this.canContrib) || (extra.can === 'admin' && this.canAdmin) || (extra.can === 'contribDep' && this.canContribDep) || (extra.can === 'adminDep' && this.canAdminDep)
      })
    },
    navigation () {
      const items = [{ to: '/', icon: 'mdi-home', title: this.$t('home') }]

      const contentGroup = { group: 'content', icon: '', title: this.$t('group.content'), items: [] }
      contentGroup.items.push({ to: '/datasets', icon: 'mdi-database', title: this.$t('datasets'), class: this.routePrefix === 'dataset' ? 'v-list-item--active' : '' })
      if (!this.env.disableApplications) {
        contentGroup.items.push({ to: '/applications', icon: 'mdi-image-multiple', title: this.$t('applications'), subtitle: this.$t('applicationsSubtitle'), class: this.routePrefix === 'application' ? 'v-list-item--active' : '' })
      }
      if (this.canAdminDep && this.env.portalsIntegration) {
        contentGroup.items.push({ to: '/pages', icon: 'mdi-text-box-edit-outline', title: 'Pages de portails (bêta)', subtitle: 'Nouvelle version' })
        contentGroup.items.push({ to: '/reuses', icon: 'mdi-text-box-edit-outline', title: 'Réutilisations (bêta)', subtitle: 'Nouvelle version' })
      }
      items.push(contentGroup)

      const managementGroup = { group: 'management', icon: '', title: this.$t('group.management'), items: [] }
      if (this.activeAccount?.type === 'organization' && this.user.organization.role === 'admin' && !this.user.organization.department) {
        managementGroup.items.push({ to: '/organization', icon: 'mdi-account-group', title: this.$t('org'), subtitle: this.activeAccount.name })
      }
      if (this.activeAccount?.type === 'organization' && this.user.organization.role === 'admin' && this.user.organization.department) {
        managementGroup.items.push({ to: '/department', icon: 'mdi-account-group', title: this.$t('dep'), subtitle: `${this.activeAccount.name} / ${this.user.organization.departmentName || this.user.organization.department}` })
      }
      if (this.canAdminDep) {
        managementGroup.items.push({ to: '/settings', icon: 'mdi-cog', title: this.$t('params'), subtitle: this.activeAccount.department ? this.$t('paramsSub') : '' })
      }
      if (this.canAdminDep && this.env.portalsIntegration) {
        managementGroup.items.push({ to: '/portals', icon: 'mdi-clipboard-text-clock', title: 'Portails (bêta)', subtitle: 'Nouvelle version' })
      }

      items.push(managementGroup)

      const connectGroup = { group: 'connect', icon: '', title: this.$t('group.connect'), items: [] }
      if (this.canAdminDep && this.env.catalogsIntegration) {
        connectGroup.items.push({ to: '/catalogs', icon: 'mdi-transit-connection', title: this.$t('catalogs') })
      }
      items.push(connectGroup)

      const monitorGroup = { group: 'monitor', icon: '', title: this.$t('group.monitor'), items: [] }
      if (this.canAdmin && this.env.subscriptionUrl) {
        monitorGroup.items.push({ to: '/subscription', icon: 'mdi-card-account-details', title: this.$t('subscription') })
      }
      if (this.canContrib) {
        monitorGroup.items.push({ to: '/storage', icon: 'mdi-harddisk', title: this.$t('storage') })
      }
      if (this.canAdmin && this.env.eventsIntegration) {
        monitorGroup.items.push({ to: '/events', icon: 'mdi-clipboard-text-clock', title: 'Traçabilité (bêta)' })
      }
      items.push(monitorGroup)

      const supportGroup = { group: 'support', icon: '', title: this.$t('group.support'), items: [] }
      if (this.canContribDep) {
        supportGroup.items.push({ to: '/api-doc', icon: 'mdi-cloud', title: this.$t('apiDoc') })
      }
      for (const extraDocLink of this.env.extraDocLinks) {
        supportGroup.items.push(extraDocLink)
      }
      items.push(supportGroup)

      if (this.user) {
        for (const extraNavItem of this.extraNavigationItems) {
          if (extraNavItem.iframe) {
            extraNavItem.to = '/extra/' + extraNavItem.id
          }
          if (typeof extraNavItem.title === 'object') {
            extraNavItem.title = extraNavItem.title[this.$i18n.locale] || extraNavItem.title[this.$i18n.defaultLocale]
          }
          if (extraNavItem.group) {
            const group = items.find(item => item.group === extraNavItem.group)
            if (group) {
              group.items.push(extraNavItem)
              continue
            }
          }
          items.push(extraNavItem)
        }
      }

      if (this.user.adminMode) {
        const adminGroup = { group: 'admin', icon: 'mdi-shield-star', title: this.$t('group.admin'), items: [], style: `background-color:${this.$vuetify.theme.themes.light.admin}` }
        adminGroup.items.push({ to: '/admin/info', icon: 'mdi-information', title: this.$t('serviceInfo') })
        adminGroup.items.push({ to: '/remote-services', icon: 'mdi-cloud', title: this.$t('services') })
        adminGroup.items.push({ to: '/admin/owners', icon: 'mdi-briefcase', title: this.$t('owners') })
        adminGroup.items.push({ to: '/admin/errors', icon: 'mdi-alert', title: this.$t('errors') })
        if (!this.env.disableApplications) {
          adminGroup.items.push({ to: '/admin/base-apps', icon: 'mdi-apps', title: this.$t('baseApplications') })
        }
        adminGroup.items.push({ href: this.env.directoryUrl + '/admin/users', icon: 'mdi-account-supervisor', title: this.$t('accountsManagement') })
        if (this.env.catalogsIntegration) {
          adminGroup.items.push({ to: '/admin/catalogs-plugins', icon: 'mdi-transit-connection', title: this.$t('catalogsPlugins') })
        }
        for (const extraNavItem of this.env.extraAdminNavigationItems) {
          if (extraNavItem.iframe) {
            extraNavItem.to = '/admin-extra/' + extraNavItem.id
          }
          if (typeof extraNavItem.title === 'object') {
            extraNavItem.title = extraNavItem.title[this.$i18n.locale] || extraNavItem.title[this.$i18n.defaultLocale]
          }
          adminGroup.items.push(extraNavItem)
        }
        items.push(adminGroup)
      }

      return items
    },
    activeGroup () {
      for (const item of this.navigation) {
        if (item.group) {
          for (const child of item.items) {
            if (child.to && this.$route.path.startsWith(child.to)) {
              return item.group
            }
          }
        }
      }
      return 'content'
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
