<template>
  <v-navigation-drawer
    v-model="drawer"
    class="navigation-left"
    color="primary"
  >
    <!--<v-list class="pa-0">
      <brand-title />
      <v-divider />
    </v-list>-->
    <v-list
      nav
      class="px-1 pt-1 pb-0"
      bg-color="primary"
    >
      <v-list-item
        v-if="missingSubscription && canAdmin"
        :to="`/subscription`"
      >
        <v-list-item-action><v-icon :icon="mdiCardAccountDetails" /></v-list-item-action>
        <v-list-item-title v-t="'subscription'" />
      </v-list-item>

      <template v-if="!missingSubscription">
        <v-list-item :to="`/`">
          <v-list-item-action><v-icon :icon="mdiHome" /></v-list-item-action>
          <v-list-item-title v-t="'dashboard'" />
        </v-list-item>

        <v-list-item :to="`/datasets`">
          <v-list-item-action><v-icon :icon="mdiDatabase" /></v-list-item-action>
          <v-list-item-title v-t="'datasets'" />
        </v-list-item>

        <v-list-item
          v-if="!$uiConfig.disableApplications"
          :to="`/applications`"
        >
          <v-list-item-action><v-icon :icon="mdiImageMultiple" /></v-list-item-action>

          <v-list-item-title v-t="'applications'" />
          <v-list-item-subtitle v-t="'applicationsSubtitle'" />
        </v-list-item>

        <v-divider class="pb-1" />

        <v-list-item
          v-if="account?.type === 'organization' && canAdmin && !account.department"
          density="compact"
          :to="`/organization`"
        >
          <v-list-item-action><v-icon :icon="mdiAccountGroup" /></v-list-item-action>

          <v-list-item-title v-t="'org'" />
          <v-list-item-subtitle>{{ account.name }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item
          v-if="account?.type === 'organization' && canAdminDep && !!account.department"
          density="compact"
          :to="`/department`"
        >
          <v-list-item-action><v-icon :icon="mdiAccountGroup" /></v-list-item-action>

          <v-list-item-title v-t="'dep'" />
          <v-list-item-subtitle>{{ account.name }} / {{ account.departmentName || account.department }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item
          v-if="canAdmin && $uiConfig.subscriptionUrl"
          :to="`/subscription`"
        >
          <v-list-item-action><v-icon :icon="mdiCardAccountDetails" /></v-list-item-action>
          <v-list-item-title v-t="'subscription'" />
        </v-list-item>

        <v-list-item
          v-if="canAdminDep"
          density="compact"
          to="/settings"
        >
          <v-list-item-action><v-icon :icon="mdiCog" /></v-list-item-action>

          <v-list-item-title>{{ t('params') }}</v-list-item-title>
          <v-list-item-subtitle v-if="!account?.department">
            {{ t('paramsSub') }}
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item
          v-if="canContrib"
          density="compact"
          to="/storage"
        >
          <v-list-item-action><v-icon :icon="mdiHarddisk" /></v-list-item-action>
          <v-list-item-title v-t="'storage'" />
        </v-list-item>

        <v-list-item
          v-if="canAdminDep && $uiConfig.catalogsIntegration"
          density="compact"
          :to="`/catalogs`"
        >
          <v-list-item-action><v-icon :icon="mdiTransitConnection" /></v-list-item-action>

          <v-list-item-title>{{ t('catalogs') }}</v-list-item-title>
        </v-list-item>

        <v-list-item
          v-if="canAdmin && $uiConfig.eventsIntegration"
          density="compact"
          :to="`/events`"
        >
          <v-list-item-action><v-icon :icon="mdiClipboardTextClock" /></v-list-item-action>

          <v-list-item-title>Traçabilité (bêta)</v-list-item-title>
        </v-list-item>

        <v-list-item
          v-if="canAdminDep && $uiConfig.portalsIntegration"
          density="compact"
          :to="`/portals`"
        >
          <v-list-item-action><v-icon :icon="mdiPresentation" /></v-list-item-action>

          <v-list-item-title>Portails</v-list-item-title>
        </v-list-item>

        <v-list-item
          v-if="canAdminDep && $uiConfig.portalsIntegration"
          density="compact"
          :to="`/pages`"
        >
          <v-list-item-action><v-icon :icon="mdiTextBoxEditOutline" /></v-list-item-action>

          <v-list-item-title>Pages de portails</v-list-item-title>
        </v-list-item>
      </template>
    </v-list>

    <v-list
      v-if="!missingSubscription"
      nav
      class="px-1 pt-0 pb-1"
      density="compact"
    >
      <v-list-group
        v-if="canContribDep"
        :value="$route.path === '/api-doc'"
      >
        <template #activator>
          <v-list-item-action><v-icon :icon="mdiInformation" /></v-list-item-action>
          <v-list-item-title v-t="'doc'" />
        </template>
        <v-list-item
          density="compact"
          to="/api-doc"
        >
          <v-list-item-action><v-icon :icon="mdiCloud" /></v-list-item-action>
          <v-list-item-title v-t="'apiDoc'" />
        </v-list-item>
        <v-list-item
          density="compact"
          href="https://datafair.cloud"
          target="blank"
        >
          <v-list-item-action><v-icon :icon="mdiBookOpenVariant" /></v-list-item-action>
          <v-list-item-title v-t="'docDataFair'" />
        </v-list-item>
      </v-list-group>
    </v-list>

    <v-list
      v-if="user && user.adminMode"
      nav
      class="px-1 pt-0 pb-1"
      density="compact"
    >
      <v-divider class="pb-1" />
      <v-list-group
        color="admin"
        :value="$route.path.startsWith('/admin') || $route.path.startsWith('/remote-services')"
      >
        <template #activator>
          <v-list-item-action><v-icon :icon="mdiShieldStar" /></v-list-item-action>
          <v-list-item-title v-t="'admin'" />
        </template>

        <v-list-item :to="`/admin/info`">
          <v-list-item-action><v-icon :icon="mdiInformation" /></v-list-item-action>
          <v-list-item-title v-t="'serviceInfo'" />
        </v-list-item>

        <v-list-item :to="`/remote-services`">
          <v-list-item-action><v-icon :icon="mdiCloud" /></v-list-item-action>
          <v-list-item-title v-t="'services'" />
        </v-list-item>

        <v-list-item :to="`/admin/owners`">
          <v-list-item-action><v-icon :icon="mdiBriefcase" /></v-list-item-action>
          <v-list-item-title v-t="'owners'" />
        </v-list-item>

        <v-list-item :to="`/admin/errors`">
          <v-list-item-action><v-icon :icon="mdiAlert" /></v-list-item-action>
          <v-list-item-title v-t="'errors'" />
        </v-list-item>

        <v-list-item
          v-if="!$uiConfig.disableApplications"
          :to="`/admin/base-apps`"
        >
          <v-list-item-action><v-icon :icon="mdiApps" /></v-list-item-action>
          <v-list-item-title v-t="'baseApplications'" />
        </v-list-item>

        <v-list-item
          :href="$sitePath + '/simple-directory/admin/users'"
        >
          <v-list-item-action><v-icon :icon="mdiAccountSupervisor" /></v-list-item-action>
          <v-list-item-title v-t="'accountsManagement'" />
        </v-list-item>
      </v-list-group>
    </v-list>

    <v-footer
      absolute
      color="transparent"
    >
      <v-spacer />
      <span class="text-caption"><a
        href="https://datafair.cloud"
        :style="'color: ' + site?.colors['on-primary']"
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
  catalogs: Catalogues distants
  storage: Stockage
  subscription: Abonnement
  doc: Documentation
  apiDoc: Utiliser l'API
  userDoc: Manuel utilisateur
  docDataFair: Documentation Data Fair
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
  catalogs: Remote catalogs
  storage: Storage
  subscription: Subscription
  doc: Documentation
  apiDoc: Use the API
  userDoc: User manual
  docDataFair: Data Fair documentation
</i18n>

<script lang="ts" setup>
import { mdiAccountGroup, mdiAccountSupervisor, mdiAlert, mdiApps, mdiBookOpenVariant, mdiBriefcase, mdiCardAccountDetails, mdiClipboardTextClock, mdiCloud, mdiCog, mdiDatabase, mdiHarddisk, mdiHome, mdiImageMultiple, mdiInformation, mdiPresentation, mdiShieldStar, mdiTextBoxEditOutline, mdiTransitConnection } from '@mdi/js'

const { drawer } = useNavigationStore()
const { account, user, site } = useSession()
const { missingSubscription } = useLimitsStore()
const { canAdminDep, canAdmin, canContribDep, canContrib } = useAccountPermissions()
const { t } = useI18n()
</script>

<style>
</style>
