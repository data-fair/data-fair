<template>
  <v-container v-if="dataset">
    <!-- Show dataset status -->
    <dataset-status v-if="!dataset.isMetaOnly && (dataset.status === 'error' || !!dataset.draftReason)" />

    <!-- Title -->
    <div class="text-headline-large mb-4">
      {{ dataset.title }}
    </div>

    <!-- Metadata section -->
    <df-section-tabs
      v-if="sections.metadata"
      id="metadata"
      v-model="metadataTab"
      :min-height="200"
      :title="sections.metadata.title"
      :tabs="sections.metadata.tabs"
      :svg="metadataSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="informations">
            <dataset-metadata-view />
          </v-tabs-window-item>
          <v-tabs-window-item value="schema">
            <dataset-schema-view />
          </v-tabs-window-item>
          <v-tabs-window-item value="attachments">
            <dataset-attachments />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Exploration section -->
    <df-section-tabs
      v-if="sections.exploration"
      id="exploration"
      v-model="explorationTab"
      :min-height="650"
      :title="sections.exploration.title"
      :tabs="sections.exploration.tabs"
      :svg="dataSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="table">
            <dataset-table :height="600" />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="dataset.bbox"
            value="map"
          >
            <dataset-map :height="600" />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="digitalDocumentField"
            value="files"
          >
            <dataset-search-files :height="600" />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="imageField"
            value="thumbnails"
          >
            <dataset-thumbnails :height="600" />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="dataset.rest?.history"
            value="revisions"
          >
            <dataset-history />
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
          <v-tabs-window-item value="related-datasets">
            <v-container fluid>
              <dataset-related-datasets />
            </v-container>
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Share section -->
    <df-section-tabs
      v-if="sections.share"
      id="share"
      :min-height="200"
      :title="sections.share.title"
      :tabs="sections.share.tabs"
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

          <v-tabs-window-item value="integration">
            <v-container fluid>
              <integration-dialog
                inline
                resource-type="datasets"
                :resource="dataset"
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
      v-model="trackingTab"
      :min-height="550"
      :title="sections.tracking.title"
      :tabs="sections.tracking.tabs"
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
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  metadata: Métadonnées
  informations: Informations
  schema: Schéma
  attachments: Pièces jointes
  exploration: Exploration des données
  table: Tableau
  map: Carte
  files: Fichiers
  thumbnails: Vignettes
  revisions: Révisions
  applications: Applications
  noApplications: Aucune application n'utilise ce jeu de données.
  relatedDatasets: Voir aussi
  share: Permissions & partage
  permissions: Permissions
  readApiKey: Clé d'API en lecture
  publicationSites: Portails
  catalogPublications: Publications dans les catalogues
  integration: Intégrer dans un site
  tracking: Suivi
  journal: Journal
  traceability: Traçabilité
  notifications: Notifications
  webhooks: Webhooks
en:
  datasets: Datasets
  metadata: Metadata
  informations: Information
  schema: Schema
  attachments: Attachments
  exploration: Data exploration
  table: Table
  map: Map
  files: Files
  thumbnails: Thumbnails
  revisions: Revisions
  applications: Applications
  noApplications: No application uses this dataset.
  relatedDatasets: See also
  share: Share
  permissions: Permissions
  readApiKey: Read API key
  publicationSites: Portals
  catalogPublications: Catalog publications
  integration: Embed in a website
  tracking: Tracking
  journal: Journal
  traceability: Traceability
  notifications: Notifications
  webhooks: Webhooks
</i18n>

<script setup lang="ts">
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import metadataSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiAttachment, mdiBell, mdiCalendarText, mdiClipboardTextClock, mdiCodeTags, mdiContentCopy, mdiEyeArrowRight, mdiHistory, mdiImage, mdiImageMultiple, mdiInformation, mdiKey, mdiMap, mdiPresentation, mdiSecurity, mdiTable, mdiTableCog, mdiTransitConnection, mdiWebhook } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const { sendUiNotif } = useUiNotif()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('informations')
const explorationTab = ref('table')
const trackingTab = ref('journal')

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

const sections = computedDeepDiff(() => {
  if (!dataset.value) return {} as Record<string, { title: string, tabs: any[] }>
  const d = dataset.value
  const result: Record<string, { title: string, tabs: any[] }> = {}

  // Metadata section
  const metadataTabs = [
    { key: 'informations', title: t('informations'), icon: mdiInformation }
  ]
  if (d.finalizedAt && !d.isMetaOnly) {
    metadataTabs.push({ key: 'schema', title: t('schema'), icon: mdiTableCog })
  }
  if (!d.draftReason) {
    metadataTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs }

  // Exploration section
  if (d.finalizedAt || d.draftReason) {
    const explorationTabs = []
    if (d.finalizedAt && !d.isMetaOnly) {
      explorationTabs.push({ key: 'table', title: t('table'), icon: mdiTable })
      if (d.bbox) {
        explorationTabs.push({ key: 'map', title: t('map'), icon: mdiMap })
      }
      if (digitalDocumentField.value) {
        explorationTabs.push({ key: 'files', title: t('files'), icon: mdiContentCopy })
      }
      if (imageField.value) {
        explorationTabs.push({ key: 'thumbnails', title: t('thumbnails'), icon: mdiImage })
      }
      if (d.rest?.history) {
        explorationTabs.push({ key: 'revisions', title: t('revisions'), icon: mdiHistory })
      }
      if (!d.draftReason || d.draftReason.key === 'file-updated') {
        explorationTabs.push({ key: 'applications', title: t('applications'), icon: mdiImageMultiple })
      }
      explorationTabs.push({ key: 'related-datasets', title: t('relatedDatasets'), icon: mdiEyeArrowRight })
    }
    if (explorationTabs.length) {
      result.exploration = { title: t('exploration'), tabs: explorationTabs }
    }
  }

  // Share section
  if (!d.draftReason || d.draftReason.key === 'file-updated') {
    const shareTabs = []
    if (can('getPermissions').value) {
      shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
    }
    if (can('getReadApiKey').value) {
      shareTabs.push({ key: 'readApiKey', title: t('readApiKey'), icon: mdiKey })
    }
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
    if ($uiConfig.catalogsIntegration && can('admin').value) {
      shareTabs.push({ key: 'catalog-publications', title: t('catalogPublications'), icon: mdiTransitConnection })
    }
    if (d.finalizedAt) {
      shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags })
    }
    if (shareTabs.length) {
      result.share = { title: t('share'), tabs: shareTabs }
    }
  }

  // Tracking section
  if (can('readJournal').value && !d.isMetaOnly) {
    const trackingTabs = [
      { key: 'journal', title: t('journal'), icon: mdiCalendarText }
    ]
    if ($uiConfig.eventsIntegration) {
      trackingTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock })
    }
    if ($uiConfig.eventsIntegration) {
      trackingTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    }
    if ($uiConfig.eventsIntegration && can('setPermissions').value) {
      trackingTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.tracking = { title: t('tracking'), tabs: trackingTabs }
  }

  return result
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))
</script>

<style>
</style>
