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
      v-model="metadataTab"
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
              variant="flat"
              :prepend-icon="mdiSquareEditOutline"
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
          </v-tabs-window-item>

          <v-tabs-window-item value="info">
            <v-btn
              v-if="can('writeDescription')"
              color="primary"
              variant="flat"
              :prepend-icon="mdiPencil"
              :to="`/application/${application.id}/edit-metadata`"
              class="mb-4"
            >
              {{ t('editMetadata') }}
            </v-btn>

            <template v-if="application.description">
              <h3 class="text-title-medium font-weight-bold mb-2">
                {{ t('description') }}
              </h3>
              <p class="text-body-medium mb-4">
                {{ application.description }}
              </p>
            </template>

            <div
              v-if="application.topics?.length"
              class="d-flex flex-wrap ga-1 mb-4"
            >
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

          <v-tabs-window-item value="details">
            <v-card>
              <v-list density="compact">
                <v-list-item
                  v-if="application.owner"
                  :prepend-icon="mdiAccount"
                >
                  <div class="text-body-small text-medium-emphasis">
                    {{ t('owner') }}
                  </div>
                  <div>{{ application.owner.name }}</div>
                </v-list-item>

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
            </v-card>
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
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="permissions">
            <permissions
              v-if="application"
              :resource="application"
              resource-type="applications"
              :disabled="!can('setPermissions')"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="protected-links">
            <application-protected-links />
          </v-tabs-window-item>

          <v-tabs-window-item value="publication-sites">
            <application-publication-sites />
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <integration-dialog
              inline
              resource-type="applications"
              :resource="application"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Events section -->
    <df-section-tabs
      v-if="sections.events"
      id="events"
      v-model="eventsTab"
      :min-height="550"
      :title="sections.events.title"
      :tabs="sections.events.tabs"
      :svg="settingsSvg"
      svg-no-margin
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="traceability">
            <event-traceability
              resource-type="application"
              :resource-id="application.id"
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration"
            value="notifications"
          >
            <event-notifications
              :resource="application"
              resource-type="application"
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration && can('setPermissions')"
            value="webhooks"
          >
            <event-webhooks
              :resource="application"
              resource-type="application"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Danger zone section -->
    <df-section-tabs
      v-if="sections.dangerZone"
      id="danger-zone"
      :svg="securitySvg"
      svg-no-margin
      color="admin"
      :title="sections.dangerZone.title"
    >
      <template #content>
        <v-list>
          <v-list-item
            v-if="can('setOwner')"
            class="py-4"
          >
            <div>
              <div class="text-body-1 font-weight-bold">
                {{ t('changeOwner') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('changeOwnerDesc') }}
              </div>
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="showOwnerDialog = true"
              >
                {{ t('changeOwner') }}
              </v-btn>
            </template>
          </v-list-item>

          <v-divider
            v-if="can('setOwner') && can('delete')"
          />

          <v-list-item
            v-if="can('delete')"
            class="py-4"
          >
            <div>
              <div class="text-body-1 font-weight-bold">
                {{ t('deleteApp') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('deleteAppDesc') }}
              </div>
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="showDeleteDialog = true"
              >
                {{ t('deleteApp') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </df-section-tabs>

    <owner-change-dialog
      v-if="can('setOwner')"
      v-model="showOwnerDialog"
      :resource="application"
      resource-type="applications"
      @changed="router.push('/applications')"
    />

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('deleteApp') }}</v-card-title>
        <v-card-text>{{ t('deleteMsg', { title: application?.title }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showDeleteDialog = false"
          >
            {{ t('no') }}
          </v-btn>
          <v-btn
            color="warning"
            variant="flat"
            @click="confirmRemove"
          >
            {{ t('yes') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <df-navigation-right>
      <application-actions />
      <toc-local :sections="tocSections" />
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
  editMetadata: Éditer les métadonnées
  details: Détails
  owner: Propriétaire
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
  dangerZone: Zone de danger
  changeOwner: Changer le propriétaire
  changeOwnerDesc: Transférer cette application à un autre propriétaire.
  deleteApp: Supprimer l'application
  deleteAppDesc: La suppression est définitive et la configuration ne pourra pas être récupérée.
  deleteMsg: Voulez-vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérée.
  yes: Oui
  no: Non
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
  editMetadata: Edit metadata
  details: Details
  owner: Owner
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
  dangerZone: Danger Zone
  changeOwner: Change owner
  changeOwnerDesc: Transfer this application to another owner.
  deleteApp: Delete application
  deleteAppDesc: Deletion is permanent and configuration cannot be recovered.
  deleteMsg: Do you really want to delete the application "{title}"? Deletion is permanent and the application configuration cannot be recovered.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiAccount, mdiBell, mdiCardTextOutline, mdiClipboardTextClock, mdiCloudKey, mdiCodeTags, mdiImage, mdiInformation, mdiPaperclip, mdiPencil, mdiPlusCircleOutline, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import { provideApplicationStore } from '~/composables/application/store'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { $uiConfig } from '~/context'

const { t, locale } = useI18n()
const { sendUiNotif } = useUiNotif()
const route = useRoute<'/application/[id]/'>()
const router = useRouter()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('config')
const eventsTab = ref('traceability')

const store = provideApplicationStore(route.params.id)
const { application, applicationLink, can, patch, remove, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch } = store
const { availableVersions } = useApplicationVersions(store)

useApplicationWatch(['draft-error'], store)

const showUpgradeDialog = ref(false)
const showOwnerDialog = ref(false)
const showDeleteDialog = ref(false)
const upgrading = ref(false)

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

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/applications')
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const sections = computedDeepDiff(() => {
  if (!application.value) return {} as Record<string, { title: string, tabs: any[] }>

  const metadataTabs = [
    { key: 'config', title: t('config'), icon: mdiSquareEditOutline },
    { key: 'info', title: t('info'), icon: mdiInformation },
    { key: 'details', title: t('details'), icon: mdiCardTextOutline },
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
    const eventsTabs = [
      { key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock }
    ]
    eventsTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions')) {
      eventsTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.events = { title: t('tracking'), tabs: eventsTabs }
  }

  if (can('setOwner') || can('delete')) {
    result.dangerZone = { title: t('dangerZone'), tabs: [] }
  }

  return result
})

const tabModels: Record<string, Ref<string>> = {
  metadata: metadataTab,
  events: eventsTab
}

const tocSections = computed(() => {
  return Object.entries(sections.value).map(([id, s]) => ({
    id: id === 'dangerZone' ? 'danger-zone' : id,
    title: s.title,
    tabs: s.tabs,
    tabModel: tabModels[id]
  }))
})
</script>
