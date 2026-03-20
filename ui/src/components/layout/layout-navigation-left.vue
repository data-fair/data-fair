<template>
  <v-navigation-drawer
    v-model="drawer"
    color="primary"
  >
    <v-list
      density="compact"
      nav
    >
      <!-- Portal home link (when not main site) -->
      <v-list-item
        v-if="site && site.main === false"
        href="/"
        :prepend-icon="mdiHome"
        :title="t('homePortal')"
      />
      <!-- Dashboard -->
      <v-list-item
        to="/"
        :prepend-icon="mdiMonitorDashboard"
        :title="t('home')"
      />
    </v-list>

    <!-- Subscription link when missing -->
    <v-list
      v-if="missingSubscription && canAdmin && $uiConfig.subscriptionUrl"
      density="compact"
      nav
    >
      <v-list-item
        to="/subscription"
        :prepend-icon="mdiCardAccountDetails"
        :title="t('subscription')"
      />
    </v-list>

    <!-- Collapsible groups -->
    <v-list
      v-if="!missingSubscription"
      v-model:opened="openedGroupsModel"
      open-strategy="multiple"
      density="compact"
      nav
    >
      <template
        v-for="group of navigationGroups"
        :key="group.key"
      >
        <template v-if="group.items.length">
          <v-divider class="mb-1" />
          <v-list-group :value="group.key">
            <template #activator="{ props: activatorProps }">
              <v-list-item
                v-bind="activatorProps"
                :title="group.title"
              />
            </template>
            <v-list-item
              v-for="item of group.items"
              :key="item.to || item.href || item.title"
              :to="item.to"
              :href="item.href"
              :target="item.href ? '_blank' : undefined"
              :prepend-icon="item.icon"
              :title="item.title"
              :subtitle="item.subtitle"
            />
          </v-list-group>
        </template>
      </template>
    </v-list>

    <template #append>
      <div class="pa-2 text-center">
        <span class="text-caption">
          <a
            href="https://data-fair.github.io/4/"
            style="color: inherit; text-decoration: none;"
          >Powered by Data Fair</a>
        </span>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { usePermissions } from '~/composables/use-permissions'
import {
  mdiHome,
  mdiMonitorDashboard,
  mdiDatabase,
  mdiImageMultiple,
  mdiCog,
  mdiTransitConnection,
  mdiCogTransferOutline,
  mdiHarddisk,
  mdiCloud,
  mdiInformation,
  mdiBriefcase,
  mdiAlert,
  mdiApps,
  mdiAccountGroup,
  mdiCardAccountDetails,
  mdiChartBar,
  mdiClipboardTextClock,
  mdiViewDashboardEdit,
  mdiPageNext,
  mdiAccountSupervisor,
} from '@mdi/js'

const { t, locale } = useI18n()
const drawer = defineModel<boolean>({ required: true })
const route = useRoute()
const session = useSessionAuthenticated()
const site = session.site
const org = session.organization
const { canContrib, canAdmin, canContribDep, canAdminDep, missingSubscription } = usePermissions()

interface NavItem {
  to?: string
  href?: string
  icon: string
  title: string
  subtitle?: string
}

interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

const extraNavigationItems = computed(() => {
  const isMain = !site.value || site.value.main !== false
  return ($uiConfig.extraNavigationItems ?? []).filter((extra: any) => {
    if (extra.mainOnly && !isMain) return false
    if (!extra.can) return true
    if (extra.can === 'contrib') return canContrib.value
    if (extra.can === 'admin') return canAdmin.value
    if (extra.can === 'contribDep') return canContribDep.value
    if (extra.can === 'adminDep') return canAdminDep.value
    return false
  })
})

function resolveTitle (title: string | Record<string, string>): string {
  if (typeof title === 'string') return title
  return title[locale.value] || title.fr || Object.values(title)[0] || ''
}

const navigationGroups = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = []
  const account = session.account.value
  const user = session.user.value

  // Content group
  const content: NavItem[] = [
    { to: '/datasets', icon: mdiDatabase, title: t('datasets') },
  ]
  if (!$uiConfig.disableApplications) {
    content.push({ to: '/applications', icon: mdiImageMultiple, title: t('applications') })
  }
  if (canAdminDep.value && $uiConfig.portalsIntegration) {
    content.push({ to: '/pages', icon: mdiViewDashboardEdit, title: t('portalPages') })
    content.push({ to: '/reuses', icon: mdiPageNext, title: t('reuses') })
  }
  groups.push({ key: 'content', title: t('group.content'), items: content })

  // Management group
  const currentOrg = org.value
  const management: NavItem[] = []
  if (account?.type === 'organization' && currentOrg?.role === $uiConfig.adminRole && !currentOrg?.department) {
    management.push({ to: '/organization', icon: mdiAccountGroup, title: t('org'), subtitle: account.name })
  }
  if (account?.type === 'organization' && currentOrg?.role === $uiConfig.adminRole && currentOrg?.department) {
    management.push({
      to: '/department',
      icon: mdiAccountGroup,
      title: t('dep'),
      subtitle: `${account.name} / ${currentOrg.departmentName || currentOrg.department}`
    })
  }
  if (canAdminDep.value) {
    management.push({ to: '/settings', icon: mdiCog, title: t('params'), subtitle: account?.department ? t('paramsSub') : undefined })
  }
  if (canAdminDep.value && $uiConfig.portalsIntegration) {
    management.push({ to: '/portals', icon: mdiMonitorDashboard, title: t('portals') })
  }
  groups.push({ key: 'management', title: t('group.management'), items: management })

  // Connectors group
  const connect: NavItem[] = []
  if (canAdminDep.value && $uiConfig.catalogsIntegration) {
    connect.push({ to: '/catalogs', icon: mdiTransitConnection, title: t('catalogs') })
  }
  if (canAdminDep.value && $uiConfig.processingsIntegration) {
    connect.push({ to: '/processings', icon: mdiCogTransferOutline, title: t('processings') })
  }
  if (connect.length) groups.push({ key: 'connect', title: t('group.connect'), items: connect })

  // Monitoring group
  const monitor: NavItem[] = []
  if (canAdmin.value && $uiConfig.subscriptionUrl) {
    monitor.push({ to: '/subscription', icon: mdiCardAccountDetails, title: t('subscription') })
  }
  if (canContrib.value) {
    monitor.push({ to: '/storage', icon: mdiHarddisk, title: t('storage') })
  }
  if ($uiConfig.metricsIntegration) {
    monitor.push({ to: '/metrics', icon: mdiChartBar, title: t('metrics'), subtitle: t('metricsSub') })
  }
  if (canAdmin.value && $uiConfig.eventsIntegration) {
    monitor.push({ to: '/events', icon: mdiClipboardTextClock, title: t('events') })
  }
  if (monitor.length) groups.push({ key: 'monitor', title: t('group.monitor'), items: monitor })

  // Help group
  const help: NavItem[] = []
  if (canContribDep.value) {
    help.push({ to: '/api-doc', icon: mdiCloud, title: t('apiDoc') })
  }
  for (const docLink of ($uiConfig.extraDocLinks ?? [])) {
    help.push({ href: docLink.href, icon: docLink.icon || mdiCloud, title: resolveTitle(docLink.title) })
  }
  if (help.length) groups.push({ key: 'help', title: t('group.help'), items: help })

  // Inject extra navigation items into their groups
  for (const extra of extraNavigationItems.value) {
    const item: NavItem = {
      to: extra.iframe ? `/extra/${extra.id}` : extra.to,
      href: extra.href,
      icon: extra.icon || mdiCloud,
      title: resolveTitle(extra.title)
    }
    if (extra.group) {
      const group = groups.find(g => g.key === extra.group)
      if (group) {
        group.items.push(item)
        continue
      }
    }
    const contentGroup = groups.find(g => g.key === 'content')
    contentGroup?.items.push(item)
  }

  // Admin group
  if (user?.adminMode) {
    const admin: NavItem[] = [
      { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
      { to: '/remote-services', icon: mdiCloud, title: t('services') },
      { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
      { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
    ]
    if (!$uiConfig.disableApplications) {
      admin.push({ to: '/admin/base-apps', icon: mdiApps, title: t('baseApplications') })
    }
    admin.push({ href: `${$sdUrl}/admin/users`, icon: mdiAccountSupervisor, title: t('accountsManagement') })
    if ($uiConfig.catalogsIntegration) {
      admin.push({ to: '/admin/catalogs-plugins', icon: mdiTransitConnection, title: t('catalogs'), subtitle: 'Plugins' })
    }
    if ($uiConfig.processingsIntegration) {
      admin.push({ to: '/admin/processings-plugins', icon: mdiCogTransferOutline, title: t('processings'), subtitle: 'Plugins' })
    }
    for (const extra of ($uiConfig.extraAdminNavigationItems ?? [])) {
      admin.push({
        to: extra.iframe ? `/admin-extra/${extra.id}` : extra.to,
        href: extra.href,
        icon: extra.icon || mdiCloud,
        title: resolveTitle(extra.title)
      })
    }
    groups.push({ key: 'admin', title: t('group.admin'), items: admin })
  }

  return groups
})

// Auto-expand the group containing the current route
const activeGroup = computed(() => {
  for (const group of navigationGroups.value) {
    for (const item of group.items) {
      if (item.to && route.path.startsWith(item.to) && item.to !== '/') {
        return group.key
      }
    }
  }
  return 'content'
})

const openedGroupsModel = ref<string[]>([activeGroup.value])

watch(activeGroup, (newGroup) => {
  if (!openedGroupsModel.value.includes(newGroup)) {
    openedGroupsModel.value = [...openedGroupsModel.value, newGroup]
  }
})
</script>

<i18n lang="yaml">
fr:
  home: Tableau de bord
  homePortal: Accueil du portail
  datasets: Jeux de données
  applications: Applications
  org: Gestion de l'organisation
  dep: Gestion du département
  params: Paramètres
  paramsSub: Licences, thématiques ...
  catalogs: Catalogues distants
  processings: Traitements périodiques
  portals: Portails
  portalPages: Pages de portails
  reuses: Réutilisations
  storage: Stockage
  metrics: Audience
  metricsSub: Téléchargements, API
  events: Traçabilité (bêta)
  subscription: Abonnement
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  baseApplications: Modèles d'application
  accountsManagement: Gestion des comptes
  apiDoc: Utiliser l'API
  group:
    content: Contenus
    management: Gestion
    connect: Connecteurs
    monitor: Suivi
    help: Aide
    admin: Administration
en:
  home: Dashboard
  homePortal: Portal home
  datasets: Datasets
  applications: Applications
  org: Manage organization
  dep: Manage department
  params: Parameters
  paramsSub: Licenses, topics ...
  catalogs: Remote catalogs
  processings: Periodic processings
  portals: Portals
  portalPages: Portal pages
  reuses: Reuses
  storage: Storage
  metrics: Audience
  metricsSub: Downloads, API
  events: Traceability (beta)
  subscription: Subscription
  services: Services
  serviceInfo: Service information
  owners: Owners
  errors: Errors
  baseApplications: Application models
  accountsManagement: Accounts management
  apiDoc: Use the API
  group:
    content: Contents
    management: Management
    connect: Connectors
    monitor: Monitoring
    help: Help
    admin: Administration
</i18n>
