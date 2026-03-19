<template>
  <v-navigation-drawer
    v-model="drawer"
    color="primary"
  >
    <v-list
      density="compact"
      nav
    >
      <v-list-item
        :to="'/'"
        :prepend-icon="mdiMonitorDashboard"
        :title="t('home')"
      />
    </v-list>

    <v-list
      v-for="group of navigationGroups"
      :key="group.key"
      density="compact"
      nav
    >
      <v-divider class="mb-1" />
      <v-list-subheader>{{ group.title }}</v-list-subheader>
      <v-list-item
        v-for="item of group.items"
        :key="item.to || item.href"
        :to="item.to"
        :href="item.href"
        :target="item.href ? '_blank' : undefined"
        :prepend-icon="item.icon"
        :title="item.title"
        :subtitle="item.subtitle"
      />
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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
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
} from '@mdi/js'

const { t } = useI18n()
const drawer = defineModel<boolean>({ required: true })
const session = useSessionAuthenticated()

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

const navigationGroups = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = []

  // Content group
  const content: NavItem[] = [
    { to: '/datasets', icon: mdiDatabase, title: t('datasets') },
  ]
  if (!$uiConfig.disableApplications) {
    content.push({ to: '/applications', icon: mdiImageMultiple, title: t('applications') })
  }
  groups.push({ key: 'content', title: t('group.content'), items: content })

  // Management group
  const management: NavItem[] = []
  const account = session.account.value
  if (account?.type === 'organization') {
    management.push({ to: '/organization', icon: mdiAccountGroup, title: t('org') })
  }
  management.push({ to: '/settings', icon: mdiCog, title: t('params') })
  groups.push({ key: 'management', title: t('group.management'), items: management })

  // Connectors group
  const connect: NavItem[] = []
  if ($uiConfig.catalogsIntegration) {
    connect.push({ to: '/catalogs', icon: mdiTransitConnection, title: t('catalogs') })
  }
  if ($uiConfig.processingsIntegration) {
    connect.push({ to: '/processings', icon: mdiCogTransferOutline, title: t('processings') })
  }
  if (connect.length) groups.push({ key: 'connect', title: t('group.connect'), items: connect })

  // Monitoring group
  const monitor: NavItem[] = []
  monitor.push({ to: '/storage', icon: mdiHarddisk, title: t('storage') })
  groups.push({ key: 'monitor', title: t('group.monitor'), items: monitor })

  // Admin group
  if (session.user.value?.adminMode) {
    const admin: NavItem[] = [
      { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
      { to: '/remote-services', icon: mdiCloud, title: t('services') },
      { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
      { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
    ]
    if (!$uiConfig.disableApplications) {
      admin.push({ to: '/admin/base-apps', icon: mdiApps, title: t('baseApplications') })
    }
    groups.push({ key: 'admin', title: t('group.admin'), items: admin })
  }

  return groups
})
</script>

<i18n lang="yaml">
fr:
  home: Tableau de bord
  datasets: Jeux de données
  applications: Applications
  org: Gestion de l'organisation
  params: Paramètres
  catalogs: Catalogues distants
  processings: Traitements périodiques
  storage: Stockage
  services: Services
  serviceInfo: Informations du service
  owners: Propriétaires
  errors: Erreurs
  baseApplications: Modèles d'application
  group:
    content: Contenus
    management: Gestion
    connect: Connecteurs
    monitor: Suivi
    admin: Administration
en:
  home: Dashboard
  datasets: Datasets
  applications: Applications
  org: Manage organization
  params: Parameters
  catalogs: Remote catalogs
  processings: Periodic processings
  storage: Storage
  services: Services
  serviceInfo: Service information
  owners: Owners
  errors: Errors
  baseApplications: Application models
  group:
    content: Contents
    management: Management
    connect: Connectors
    monitor: Monitoring
    admin: Administration
</i18n>
