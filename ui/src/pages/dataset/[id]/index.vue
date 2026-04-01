<template>
  <v-container v-if="dataset">
    <!-- Show dataset status -->
    <dataset-status v-if="!dataset.isMetaOnly && (dataset.status === 'error' || !!dataset.draftReason)" />

    <!-- Show dataset metadata : Title, thumbnail, description, and others metadata -->
    <dataset-metadata-view />

    <!-- Data section -->
    <df-section-tabs
      v-if="dataSection"
      :id="dataSection.id"
      v-model="dataTab"
      :min-height="140"
      :title="dataSection.title"
      :tabs="dataSection.tabs"
      :svg="dataSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="data">
            <v-row>
              <!-- Table -->
              <v-col
                cols="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/table`"
                  variant="outlined"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :icon="mdiTable"
                    />
                    <div class="mt-2">
                      {{ t('table') }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Map -->
              <v-col
                v-if="dataset.bbox"
                cols="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/map`"
                  variant="outlined"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :icon="mdiMap"
                    />
                    <div class="mt-2">
                      {{ t('map') }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Files -->
              <v-col
                v-if="digitalDocumentField"
                cols="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/files`"
                  variant="outlined"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :icon="mdiContentCopy"
                    />
                    <div class="mt-2">
                      {{ t('files') }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Thumbnails -->
              <v-col
                v-if="imageField"
                cols="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/thumbnails`"
                  variant="outlined"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :icon="mdiImage"
                    />
                    <div class="mt-2">
                      {{ t('thumbnails') }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Revisions -->
              <v-col
                v-if="dataset.rest?.history"
                cols="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/revisions`"
                  variant="outlined"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :icon="mdiHistory"
                    />
                    <div class="mt-2">
                      {{ t('revisions') }}
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-tabs-window-item>
          <v-tabs-window-item value="applications">
            <v-container fluid>
              <v-row v-if="applications.length">
                <v-col
                  v-for="app in applications"
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
              <p v-else>
                {{ t('noApplications') }}
              </p>
            </v-container>
          </v-tabs-window-item>
          <v-tabs-window-item value="schema">
            <dataset-schema-view />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Share section -->
    <df-section-tabs
      v-if="shareSection"
      :id="shareSection.id"
      :min-height="200"
      :title="shareSection.title"
      :tabs="shareSection.tabs"
      :svg="shareSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window :model-value="tab">
          <v-tabs-window-item value="permissions">
            <v-container fluid>
              <permissions
                v-if="dataset"
                :resource="dataset"
                resource-type="datasets"
                :disabled="!can('setPermissions').value"
              />
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <v-container fluid>
              <integration-dialog
                inline
                resource-type="datasets"
                :resource="dataset"
              />
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="readApiKey">
            <v-container fluid>
              <dataset-read-api-key />
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="publication-sites">
            <dataset-publication-sites />
          </v-tabs-window-item>

          <!-- Catalog publications -->
          <v-tabs-window-item
            v-if="$uiConfig.catalogsIntegration && can('admin').value"
            value="catalog-publications"
          >
            <v-container fluid>
              <h3 class="text-title-small font-weight-bold mt-4">
                {{ t('catalogPublications') }}
              </h3>
              <d-frame
                :src="catalogPublicationsUrl"
                sync-params
                @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
              />
            </v-container>
          </v-tabs-window-item>

          <v-tabs-window-item value="related-datasets">
            <v-container fluid>
              <dataset-related-datasets />
            </v-container>
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Activity section -->
    <df-section-tabs
      v-if="activitySection"
      :id="activitySection.id"
      v-model="activityTab"
      :min-height="550"
      :title="activitySection.title"
      :tabs="activitySection.tabs"
      :svg="settingsSvg"
      svg-no-margin
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
                :task-progress="taskProgress"
                type="dataset"
              />
            </v-container>
          </v-tabs-window-item>
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
            <notifications-dialog
              :resource="dataset"
              resource-type="dataset"
              inline
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration && can('setPermissions').value"
            value="webhooks"
          >
            <v-container fluid>
              <webhooks-dialog
                inline
                :resource="dataset"
                resource-type="dataset"
              />
            </v-container>
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <df-navigation-right>
      <dataset-actions />
      <df-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  schema: Schéma
  content: Contenu
  data: Données
  table: Tableau
  map: Carte
  files: Fichiers
  thumbnails: Vignettes
  revisions: Révisions
  applications: Applications
  noApplications: Aucune application n'utilise ce jeu de données.
  share: Partage
  permissions: Permissions
  publicationSites: Portails
  catalogPublications: Publications dans les catalogues
  relatedDatasets: Voir aussi
  integration: Intégrer dans un site
  readApiKey: Clé d'API en lecture
  activity: Activité
  journal: Journal
  traceability: Traçabilité
  notifications: Notifications
  webhooks: Webhooks
en:
  datasets: Datasets
  schema: Schema
  content: View data
  data: Content
  table: Table
  map: Map
  files: Files
  thumbnails: Thumbnails
  revisions: Revisions
  applications: Applications
  noApplications: No application uses this dataset.
  share: Share
  permissions: Permissions
  publicationSites: Portals
  catalogPublications: Catalog publications
  relatedDatasets: See also
  integration: Embed in a website
  readApiKey: Read API key
  activity: Activity
  journal: Journal
  traceability: Traceability
  notifications: Notifications
  webhooks: Webhooks
</i18n>

<script setup lang="ts">
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiBell, mdiCalendarText, mdiClipboardTextClock, mdiCodeTags, mdiContentCopy, mdiEyeArrowRight, mdiHistory, mdiImage, mdiImageMultiple, mdiKey, mdiMap, mdiPresentation, mdiSecurity, mdiTable, mdiTableCog, mdiTransitConnection, mdiWebhook } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const { sendUiNotif } = useUiNotif()

const breadcrumbs = useBreadcrumbs()
const dataTab = ref('data')
const activityTab = ref('journal')

const store = provideDatasetStore(route.params.id, true, 'vuetify')
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, publishedDatasetFetch, digitalDocumentField, imageField, can } = store

useDatasetWatch(store, ['journal', 'info', 'taskProgress'])

// Fetch additional data once dataset is loaded
watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id }
    ]
  })
  if (can('readJournal').value && !journalFetch.initialized.value) journalFetch.refresh()
  if (!taskProgressFetch.initialized.value) taskProgressFetch.refresh()
  if (d.finalizedAt && !applicationsFetch.initialized.value) applicationsFetch.refresh()
  if (d.draftReason?.key === 'file-updated' && !publishedDatasetFetch.initialized.value) publishedDatasetFetch.refresh()
}, { immediate: true })

const applications = computed(() => applicationsFetch.data.value?.results ?? [])

const catalogPublicationsUrl = computed(() => {
  if (!dataset.value) return ''
  return `${window.location.origin}/catalogs/dataset-publications?dataset-id=${dataset.value.id}`
})

const traceabilityUrl = computed(() => {
  if (!dataset.value) return ''
  return `${window.location.origin}/events/embed/traceability?resource=${encodeURIComponent($apiPath + '/datasets/' + dataset.value.id)}`
})

const dataSection = computed(() => sections.value.find(s => s.id === 'data'))
const shareSection = computed(() => sections.value.find(s => s.id === 'share'))
const activitySection = computed(() => sections.value.find(s => s.id === 'activity'))

const sections = computedDeepDiff(() => {
  if (!dataset.value) return []
  const d = dataset.value
  const result: any[] = []

  if (d.finalizedAt || d.draftReason) {
    const dataTabs = []
    if (d.finalizedAt && !d.isMetaOnly) {
      dataTabs.push({ key: 'data', title: t('data'), icon: mdiTable })
      if (!d.draftReason || d.draftReason.key === 'file-updated') {
        dataTabs.push({ key: 'applications', title: t('applications'), icon: mdiImageMultiple })
      }
      dataTabs.push({ key: 'schema', title: t('schema'), icon: mdiTableCog })
    }
    if (dataTabs.length) {
      result.push({
        title: t('content'),
        id: 'data',
        tabs: dataTabs
      })
    }
  }

  if (!d.draftReason || d.draftReason.key === 'file-updated') {
    const shareTabs = []
    if (can('getPermissions').value) {
      shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
    }
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
    if ($uiConfig.catalogsIntegration && can('admin').value) {
      shareTabs.push({ key: 'catalog-publications', title: t('catalogPublications'), icon: mdiTransitConnection })
    }
    shareTabs.push({ key: 'related-datasets', title: t('relatedDatasets'), icon: mdiEyeArrowRight })
    if (can('getReadApiKey').value) {
      shareTabs.push({ key: 'readApiKey', title: t('readApiKey'), icon: mdiKey })
    }
    if (d.finalizedAt) {
      shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags })
    }
    if (shareTabs.length) {
      result.push({ title: t('share'), id: 'share', tabs: shareTabs })
    }
  }

  if (can('readJournal').value && !d.isMetaOnly) {
    const activityTabs = [
      { key: 'journal', title: t('journal'), icon: mdiCalendarText }
    ]
    if ($uiConfig.eventsIntegration) {
      activityTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock })
    }
    if ($uiConfig.eventsIntegration) {
      activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    }
    if ($uiConfig.eventsIntegration && can('setPermissions').value) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.push({
      title: t('activity'),
      id: 'activity',
      tabs: activityTabs
    })
  }

  return result
})
</script>

<style>
</style>
