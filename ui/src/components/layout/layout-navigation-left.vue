<template>
  <v-navigation-drawer
    v-model="drawer"
    color="primary"
  >
    <v-list
      density="compact"
      bg-color="primary"
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

      <!-- Subscription link when missing -->
      <v-list-item
        v-if="missingSubscription && canAdmin && $uiConfig.subscriptionUrl"
        to="/subscription"
        :prepend-icon="mdiCardAccountDetails"
        :title="t('subscription')"
      />

      <template v-if="!missingSubscription">
        {{ navigationGroups }}
        <v-list-group
          v-for="group of navigationGroups"
          :key="group.key"
          :value="group.key"
          :title="group.title"
          :color="group.key === 'admin' ? 'admin' : undefined"
        >
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
    </v-list>

    <template #append>
      <div class="pa-2 text-center">
        <a
          href="https://data-fair.github.io/4/"
          class="text-label-small"
          style="color: inherit; text-decoration: none; opacity: 0.9;"
        >Powered by Data Fair</a>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { usePermissions } from '~/composables/use-permissions'
import { useNavigationItems } from '~/composables/layout/use-navigation-items'
import {
  mdiHome,
  mdiMonitorDashboard,
  mdiCardAccountDetails,
} from '@mdi/js'

const drawer = defineModel<boolean>({ required: true })
const { t } = useI18n()
const { site } = useSessionAuthenticated()
const { canAdmin, missingSubscription } = usePermissions()
const { navigationGroups } = useNavigationItems()
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
  agents: Agents
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
  agents: Agents
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

<style scoped>
:deep(.v-list-group__items .v-list-item) {
  padding-inline-start: 16px !important;
}

:deep(.v-list-item__spacer) {
  width: 16px;
}
</style>
