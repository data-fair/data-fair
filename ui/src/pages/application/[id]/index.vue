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

    <v-row class="application">
      <v-col>
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <!-- Metadata section -->
          <df-section-tabs
            v-if="section.id === 'metadata'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <v-row>
                      <v-col
                        cols="12"
                        md="6"
                      >
                        <div class="text-title-medium mb-2">
                          {{ application.title }}
                        </div>
                        <p
                          v-if="application.description"
                          class="text-body-medium"
                        >
                          {{ application.description }}
                        </p>
                      </v-col>
                      <v-col
                        cols="12"
                        md="6"
                      >
                        <v-list density="compact">
                          <v-list-item v-if="baseAppFetch.data.value">
                            <template #prepend>
                              <v-icon :icon="mdiImage" />
                            </template>
                            <v-list-item-title>
                              {{ baseAppFetch.data.value.title || application.url }}
                              <span v-if="baseAppFetch.data.value.version">
                                — {{ t('version') }} {{ baseAppFetch.data.value.version }}
                              </span>
                            </v-list-item-title>
                          </v-list-item>
                          <v-list-item v-if="application.updatedAt">
                            <template #prepend>
                              <v-icon :icon="mdiPencil" />
                            </template>
                            <v-list-item-title>
                              {{ application.updatedBy?.name }} {{ formatDate(application.updatedAt) }}
                            </v-list-item-title>
                          </v-list-item>
                          <v-list-item>
                            <template #prepend>
                              <v-icon :icon="mdiPlusCircleOutline" />
                            </template>
                            <v-list-item-title>
                              {{ application.createdBy?.name }} {{ formatDate(application.createdAt) }}
                            </v-list-item-title>
                          </v-list-item>
                        </v-list>
                        <v-chip
                          v-for="topic in application.topics"
                          :key="topic.id"
                          size="small"
                          class="mr-1 mb-1"
                        >
                          {{ topic.title }}
                        </v-chip>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="datasets">
                  <v-container fluid>
                    <v-row v-if="datasets.length">
                      <v-col
                        v-for="dataset in datasets"
                        :key="dataset.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <v-card :to="`/dataset/${dataset.id}`">
                          <v-card-title class="text-body-large font-weight-bold">
                            {{ dataset.title || dataset.id }}
                          </v-card-title>
                        </v-card>
                      </v-col>
                    </v-row>
                    <p v-else>
                      {{ t('noDatasets') }}
                    </p>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item
                  v-if="childrenApps.length"
                  value="children-apps"
                >
                  <v-container fluid>
                    <v-row>
                      <v-col
                        v-for="app in childrenApps"
                        :key="app.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <v-card :to="`/application/${app.id}`">
                          <v-card-title class="text-body-large font-weight-bold">
                            {{ app.title || app.id }}
                          </v-card-title>
                        </v-card>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="attachments">
                  <application-attachments />
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </df-section-tabs>

          <!-- Render section -->
          <df-section-tabs
            v-if="section.id === 'render'"
            :id="section.id"
            :min-height="390"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="config">
                  <v-container fluid>
                    <v-alert
                      v-if="application.errorMessage"
                      type="error"
                      variant="tonal"
                      class="mb-4"
                    >
                      <p v-html="t('validatedError')" />
                      <p
                        class="mb-0"
                        v-html="application.errorMessage"
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
              </v-tabs-window>
            </template>
          </df-section-tabs>

          <!-- Share section -->
          <df-section-tabs
            v-if="section.id === 'share'"
            :id="section.id"
            :min-height="250"
            :title="section.title"
            :tabs="section.tabs"
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

                <v-tabs-window-item value="integration">
                  <v-container fluid>
                    <integration-dialog
                      inline
                      resource-type="applications"
                      :resource="application"
                    />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="publication-sites">
                  <application-publication-sites />
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </df-section-tabs>

          <!-- Activity section -->
          <df-section-tabs
            v-if="section.id === 'activity'"
            :id="section.id"
            :min-height="550"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="journal">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <journal-view
                      v-if="journal"
                      :journal="journal"
                      type="application"
                    />
                  </v-container>
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
        </template>
      </v-col>
    </v-row>

    <df-navigation-right>
      <application-actions />
      <df-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  info: Informations
  datasets: Jeux de données
  noDatasets: Aucun jeu de données utilisé.
  childrenApps: Applications utilisées
  attachments: Pièces jointes
  metadata: Métadonnées
  render: Rendu
  config: Configuration
  editConfig: Éditer la configuration
  validatedError: "Erreur dans la <b>version validée</b>"
  share: Partage
  permissions: Permissions
  protectedLink: Lien protege
  integration: Intégrer dans un site
  publicationSites: Portails
  activity: Activité
  journal: Journal
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
  datasets: Datasets
  noDatasets: No datasets used.
  childrenApps: Used applications
  attachments: Attachments
  metadata: Metadata
  render: Render
  config: Configuration
  editConfig: Edit configuration
  validatedError: "Error in the <b>validated version</b>"
  share: Share
  permissions: Permissions
  protectedLink: Protected link
  integration: Embed in a website
  publicationSites: Portals
  activity: Activity
  journal: Journal
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
import { mdiBell, mdiCalendarText, mdiCloudKey, mdiCodeTags, mdiDatabase, mdiImage, mdiImageMultiple, mdiInformation, mdiPaperclip, mdiPencil, mdiPlusCircleOutline, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import { provideApplicationStore } from '~/composables/application/store'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { $uiConfig } from '~/context'

const { t, locale } = useI18n()
const route = useRoute<'/application/[id]/'>()
const router = useRouter()

const breadcrumbs = useBreadcrumbs()
const store = provideApplicationStore(route.params.id)
const { application, applicationLink, can, patch, journal, journalFetch, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch } = store
const { availableVersions } = useApplicationVersions(store)

useApplicationWatch(['journal', 'draft-error'], store)

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
  if (can('readJournal') && !journalFetch.initialized.value) journalFetch.refresh()
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

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const sections = computedDeepDiff(() => {
  if (!application.value) return []

  const metadataTabs = [
    { key: 'info', title: t('info'), icon: mdiInformation },
    { key: 'datasets', title: t('datasets'), icon: mdiDatabase }
  ]
  if (childrenApps.value.length) {
    metadataTabs.push({ key: 'children-apps', title: t('childrenApps'), icon: mdiImageMultiple })
  }
  metadataTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiPaperclip })

  const result: any[] = [
    { title: t('metadata'), id: 'metadata', tabs: metadataTabs },
    { title: t('render'), id: 'render', tabs: [{ key: 'config', title: t('config'), icon: mdiSquareEditOutline }] }
  ]

  const shareTabs = []
  if (can('getPermissions')) {
    shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
  }
  if (can('getKeys')) {
    shareTabs.push({ key: 'protected-links', title: t('protectedLink'), icon: mdiCloudKey })
  }
  shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags })
  if (!$uiConfig.disablePublicationSites) {
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
  }
  if (shareTabs.length) {
    result.push({ title: t('share'), id: 'share', tabs: shareTabs })
  }

  if (can('readJournal')) {
    const activityTabs = [
      { key: 'journal', title: t('journal'), icon: mdiCalendarText }
    ]
    if ($uiConfig.eventsIntegration) {
      activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    }
    if ($uiConfig.eventsIntegration && can('setPermissions')) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.push({ title: t('activity'), id: 'activity', tabs: activityTabs })
  }

  return result
})
</script>

<style>
.application .v-tab {
  font-weight: bold;
}
</style>
