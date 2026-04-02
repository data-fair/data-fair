<template>
  <v-container v-if="application">
    <v-alert
      v-if="upgradeAvailable && can('writeConfig')"
      type="info"
      variant="tonal"
      class="mb-4"
      closable
    >
      {{ t('upgradeAvailable', { version: upgradeAvailable.version }) }}
      <v-btn
        color="accent"
        variant="text"
        size="small"
        class="ml-2"
        @click="showUpgradeDialog = true"
      >
        {{ t('upgradeAction') }}
      </v-btn>
    </v-alert>

    <v-dialog
      v-model="showUpgradeDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('upgradeTitle') }}</v-card-title>
        <v-card-text>
          {{ t('upgradeConfirm', { version: upgradeAvailable?.version }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showUpgradeDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            :loading="upgrading"
            @click="confirmUpgrade"
          >
            {{ t('upgrade') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Metadata section -->
    <df-section-tabs
      v-if="sections.metadata"
      id="metadata"
      :min-height="300"
      :title="sections.metadata.title"
      :tabs="sections.metadata.tabs"
      :svg="checklistSvg"
      svg-no-margin
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="config">
            <v-container fluid>
              <v-alert
                v-if="application.errorMessage"
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <i18n-t
                  keypath="validatedError"
                  tag="p"
                >
                  <template #bold>
                    <b>{{ t('validatedErrorBold') }}</b>
                  </template>
                </i18n-t>
                <p
                  class="mb-0"
                  v-html="/*eslint-disable-line vue/no-v-html*/application.errorMessage"
                />
              </v-alert>
              <v-btn
                v-if="can('writeConfig')"
                :to="`/application/${application.id}/config`"
                color="primary"
                class="mb-4"
              >
                {{ t('editConfig') }}
              </v-btn>
              <v-card
                variant="outlined"
                class="pa-0"
              >
                <d-frame
                  :src="`${applicationLink}?embed=true`"
                  resize="no"
                />
              </v-card>
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="info">
            <v-row>
              <!-- Left: description -->
              <v-col
                cols="12"
                md="6"
              >
                <template v-if="application.description">
                  <h3 class="text-title-medium font-weight-bold mb-2">
                    {{ t('description') }}
                  </h3>
                  <p class="text-body-medium mb-4">
                    {{ application.description }}
                  </p>
                </template>
              </v-col>

              <!-- Right: metadata card -->
              <v-col
                cols="12"
                md="6"
              >
                <v-card>
                  <v-list density="compact">
                    <v-list-item
                      v-if="baseAppFetch.data.value"
                      :prepend-icon="mdiImage"
                    >
                      <div class="text-body-small text-medium-emphasis">
                        {{ t('baseApp') }}
                      </div>
                      <div>
                        {{ baseAppFetch.data.value.title || application.url }}
                        <span v-if="baseAppFetch.data.value.version">
                          — {{ t('version') }} {{ baseAppFetch.data.value.version }}
                        </span>
                      </div>
                    </v-list-item>
                    <v-list-item
                      v-if="application.updatedAt"
                      :prepend-icon="mdiPencil"
                    >
                      <div class="text-body-small text-medium-emphasis">
                        {{ t('metadataUpdated') }}
                      </div>
                      <div>{{ application.updatedBy?.name }} {{ formatDate(application.updatedAt) }}</div>
                    </v-list-item>
                    <v-list-item :prepend-icon="mdiPlusCircleOutline">
                      <div class="text-body-small text-medium-emphasis">
                        {{ t('created') }}
                      </div>
                      <div>{{ application.createdBy?.name }} {{ formatDate(application.createdAt) }}</div>
                    </v-list-item>
                  </v-list>
                  <template v-if="application.topics?.length">
                    <v-divider />
                    <div class="d-flex flex-wrap ga-1 pa-3">
                      <v-chip
                        v-for="topic in application.topics"
                        :key="topic.id"
                        size="small"
                        color="primary"
                        variant="outlined"
                      >
                        {{ topic.title }}
                      </v-chip>
                    </div>
                  </template>
                </v-card>
              </v-col>
            </v-row>

            <!-- Jeux de données -->
            <h3 class="text-title-medium font-weight-bold mt-6 mb-3">
              {{ t('datasets') }}
            </h3>
            <v-row v-if="datasets.length">
              <v-col
                v-for="dataset in datasets"
                :key="dataset.id"
                cols="12"
                md="6"
                lg="4"
              >
                <dataset-card :dataset="dataset" />
              </v-col>
            </v-row>
            <p v-else>
              {{ t('noDatasets') }}
            </p>

            <!-- Applications -->
            <template v-if="childrenApps.length">
              <h3 class="text-title-medium font-weight-bold mt-6 mb-3">
                {{ t('childrenApps') }}
              </h3>
              <v-row>
                <v-col
                  v-for="app in childrenApps"
                  :key="app.id"
                  cols="12"
                  md="6"
                  lg="4"
                >
                  <application-card :application="app" />
                </v-col>
              </v-row>
            </template>
          </v-tabs-window-item>

          <v-tabs-window-item value="attachments">
            <application-attachments />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Share section -->
    <df-section-tabs
      v-if="sections.share"
      id="share"
      :min-height="250"
      :title="sections.share.title"
      :tabs="sections.share.tabs"
      :svg="shareSvg"
      svg-no-margin
    >
      <template #content="{ tab }">
        <v-tabs-window :model-value="tab">
          <v-tabs-window-item value="permissions">
            <v-container fluid>
              <permissions
                v-if="application"
                :resource="application"
                resource-type="applications"
                :disabled="!can('setPermissions')"
              />
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="protected-links">
            <application-protected-links />
          </v-tabs-window-item>

          <v-tabs-window-item value="publication-sites">
            <application-publication-sites />
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <v-container fluid>
              <integration-dialog
                inline
                resource-type="applications"
                :resource="application"
              />
            </v-container>
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Tracking section -->
    <df-section-tabs
      v-if="sections.tracking"
      id="tracking"
      :min-height="550"
      :title="sections.tracking.title"
      :tabs="sections.tracking.tabs"
      :svg="settingsSvg"
      svg-no-margin
    >
      <template #content="{ tab }">
        <v-tabs-window :model-value="tab">
          <v-tabs-window-item value="traceability">
            <d-frame
              :src="traceabilityUrl"
              sync-params
              @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration"
            value="notifications"
          >
            <v-container fluid>
              <notifications-dialog
                inline
                :resource="application"
                resource-type="application"
              />
            </v-container>
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration && can('setPermissions')"
            value="webhooks"
          >
            <v-container fluid>
              <webhooks-dialog
                inline
                :resource="application"
                resource-type="application"
              />
            </v-container>
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <df-navigation-right>
      <application-actions />
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  info: Informations
  description: Description
  baseApp: Application de base
  metadataUpdated: Métadonnées mises à jour
  created: Création
  datasets: Jeux de données
  noDatasets: Aucun jeu de données utilisé.
  childrenApps: Applications utilisées
  attachments: Pièces jointes
  metadata: Métadonnées
  config: Configuration
  editConfig: Éditer la configuration
  validatedError: "Erreur dans la {bold}"
  validatedErrorBold: version validée
  share: Permissions & partage
  permissions: Permissions
  protectedLink: Lien protégé
  publicationSites: Portails
  integration: Intégrer dans un site
  tracking: Suivi
  traceability: Traçabilité
  notifications: Notifications
  webhooks: Webhooks
  version: version
  upgradeAvailable: "Version {version} disponible"
  upgradeAction: Mettre à jour
  upgradeTitle: Mise à jour de version
  upgradeConfirm: "Voulez-vous mettre à jour l'application vers la version {version} ? L'application sera reconfigurée avec la nouvelle version."
  cancel: Annuler
  upgrade: Mettre à jour
en:
  applications: Applications
  info: Information
  description: Description
  baseApp: Base application
  metadataUpdated: Metadata updated
  created: Created
  datasets: Datasets
  noDatasets: No datasets used.
  childrenApps: Used applications
  attachments: Attachments
  metadata: Metadata
  config: Configuration
  editConfig: Edit configuration
  validatedError: "Error in the {bold}"
  validatedErrorBold: validated version
  share: Share
  permissions: Permissions
  protectedLink: Protected link
  publicationSites: Portals
  integration: Embed in a website
  tracking: Tracking
  traceability: Traceability
  notifications: Notifications
  webhooks: Webhooks
  version: version
  upgradeAvailable: "Version {version} available"
  upgradeAction: Upgrade
  upgradeTitle: Version upgrade
  upgradeConfirm: "Do you want to upgrade the application to version {version}? The application will be reconfigured with the new version."
  cancel: Cancel
  upgrade: Upgrade
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiBell, mdiClipboardTextClock, mdiCloudKey, mdiCodeTags, mdiImage, mdiInformation, mdiPaperclip, mdiPencil, mdiPlusCircleOutline, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import { provideApplicationStore } from '~/composables/application/store'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { $apiPath, $uiConfig } from '~/context'

const { t, locale } = useI18n()
const { sendUiNotif } = useUiNotif()
const route = useRoute<'/application/[id]/'>()
const router = useRouter()

const breadcrumbs = useBreadcrumbs()
const store = provideApplicationStore(route.params.id)
const { application, applicationLink, can, patch, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch } = store
const { availableVersions } = useApplicationVersions(store)

useApplicationWatch(['draft-error'], store)

// Fetch additional data once application is loaded
watch(application, (app) => {
  if (!app) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('applications'), to: '/applications' },
      { text: app.title || app.id }
    ]
  })
  if (!configFetch.initialized.value) configFetch.refresh()
  if (!baseAppFetch.initialized.value) baseAppFetch.refresh()
}, { immediate: true })

// Fetch datasets and children apps once config is loaded
watch(() => store.config.value, (conf) => {
  if (!conf) return
  if (!datasetsFetch.initialized.value) datasetsFetch.refresh()
  if (!childrenAppsFetch.initialized.value) childrenAppsFetch.refresh()
}, { immediate: true })

const datasets = computed(() => datasetsFetch.data.value?.results ?? [])
const childrenApps = computed(() => childrenAppsFetch.data.value?.results ?? [])

const upgradeAvailable = computed(() => {
  if (!availableVersions.value?.length) return null
  const currentVersion = baseAppFetch.data.value?.version
  if (!currentVersion) return null
  const latest = availableVersions.value[0]
  if (latest.version === currentVersion) return null
  return latest
})

const showUpgradeDialog = ref(false)
const upgrading = ref(false)

const confirmUpgrade = async () => {
  if (!upgradeAvailable.value) return
  upgrading.value = true
  try {
    await patch({ urlDraft: upgradeAvailable.value.url })
    showUpgradeDialog.value = false
    router.push(`/application/${route.params.id}/config`)
  } finally {
    upgrading.value = false
  }
}

const traceabilityUrl = computed(() => {
  if (!application.value) return ''
  return `${window.location.origin}/events/embed/traceability?resource=${encodeURIComponent($apiPath + '/applications/' + application.value.id)}`
})

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const sections = computedDeepDiff(() => {
  if (!application.value) return {} as Record<string, { title: string, tabs: any[] }>

  const metadataTabs = [
    { key: 'config', title: t('config'), icon: mdiSquareEditOutline },
    { key: 'info', title: t('info'), icon: mdiInformation },
    { key: 'attachments', title: t('attachments'), icon: mdiPaperclip }
  ]

  const result: Record<string, { title: string, tabs: any[] }> = {
    metadata: { title: t('metadata'), tabs: metadataTabs }
  }

  const shareTabs = []
  if (can('getPermissions')) {
    shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
  }
  if (can('getKeys')) {
    shareTabs.push({ key: 'protected-links', title: t('protectedLink'), icon: mdiCloudKey })
  }
  if (!$uiConfig.disablePublicationSites) {
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
  }
  shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags })
  if (shareTabs.length) {
    result.share = { title: t('share'), tabs: shareTabs }
  }

  if ($uiConfig.eventsIntegration) {
    const trackingTabs = [
      { key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock }
    ]
    trackingTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions')) {
      trackingTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.tracking = { title: t('tracking'), tabs: trackingTabs }
  }

  return result
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))
</script>
