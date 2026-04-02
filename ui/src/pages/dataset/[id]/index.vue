<template>
  <v-container v-if="dataset">
    <!-- Show dataset status -->
    <dataset-status v-if="!dataset.isMetaOnly && (dataset.status === 'error' || !!dataset.draftReason)" />

    <!-- Title -->
    <div class="text-headline-large mb-4">
      {{ dataset.title }}
    </div>

    <!-- Import section -->
    <df-section-tabs
      v-if="sections.import"
      id="import"
      v-model="importTab"
      :min-height="200"
      :title="sections.import.title"
      :tabs="sections.import.tabs"
      :svg="importSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="source">
            <dataset-import-source />
          </v-tabs-window-item>

          <v-tabs-window-item value="journal">
            <journal-view
              v-if="journal"
              :journal="journal"
              :task-progress="taskProgress"
              type="dataset"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

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

          <v-tabs-window-item value="details">
            <dataset-metadata-details />
          </v-tabs-window-item>

          <v-tabs-window-item value="schema">
            <dataset-schema-view />
          </v-tabs-window-item>

          <v-tabs-window-item value="attachments">
            <dataset-attachments />
          </v-tabs-window-item>

          <v-tabs-window-item value="related-datasets">
            <dataset-related-datasets />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Exploration section -->
    <df-section-tabs
      v-if="sections.exploration"
      id="exploration"
      v-model="explorationTab"
      :min-height="200"
      :title="sections.exploration.title"
      :tabs="sections.exploration.tabs"
      :svg="dataSvg"
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="generic-views">
            <v-row>
              <v-col
                v-for="view in genericViewCards"
                :key="view.key"
                cols="12"
                sm="6"
                md="4"
                lg="3"
              >
                <v-card
                  :to="`/dataset/${dataset.id}/${view.key}`"
                  hover
                >
                  <v-card-item>
                    <template #prepend>
                      <v-icon
                        :icon="view.icon"
                        size="large"
                      />
                    </template>
                    <v-card-title>{{ view.title }}</v-card-title>
                  </v-card-item>
                </v-card>
              </v-col>
            </v-row>
          </v-tabs-window-item>

          <v-tabs-window-item value="applications">
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
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="permissions">
            <permissions
              v-if="dataset"
              :resource="dataset"
              resource-type="datasets"
              :disabled="!can('setPermissions').value"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="readApiKey">
            <dataset-read-api-key />
          </v-tabs-window-item>

          <v-tabs-window-item value="publication-sites">
            <dataset-publication-sites />
          </v-tabs-window-item>

          <!-- Catalog publications -->
          <v-tabs-window-item
            v-if="$uiConfig.catalogsIntegration && can('admin').value"
            value="catalog-publications"
          >
            <h3 class="text-title-small font-weight-bold mt-4">
              {{ t('catalogPublications') }}
            </h3>
            <d-frame
              :src="catalogPublicationsUrl"
              sync-params
              @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <integration-dialog
              inline
              resource-type="datasets"
              :resource="dataset"
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
            <webhooks-dialog
              inline
              :resource="dataset"
              resource-type="dataset"
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
            v-if="can('setOwner').value"
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
            v-if="can('setOwner').value && can('delete').value"
          />

          <v-list-item
            v-if="can('delete').value"
            class="py-4"
          >
            <div>
              <div class="text-body-1 font-weight-bold">
                {{ t('deleteDataset') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('deleteDatasetDesc') }}
              </div>
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="showDeleteDialog = true"
              >
                {{ t('deleteDataset') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </df-section-tabs>

    <owner-change-dialog
      v-if="can('setOwner').value"
      v-model="showOwnerDialog"
      :resource="dataset"
      resource-type="datasets"
      @changed="router.push('/datasets')"
    />

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('deleteDataset') }}</v-card-title>
        <v-card-text>{{ t('deleteMsg', { title: dataset?.title }) }}</v-card-text>
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
      <dataset-actions />
      <toc-local :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  import: Import
  source: Source
  metadata: Métadonnées
  informations: Informations
  details: Détails
  schema: Schéma
  attachments: Pièces jointes
  exploration: Exploration des données
  genericViews: Vues génériques
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
  dangerZone: Zone de danger
  changeOwner: Changer le propriétaire
  changeOwnerDesc: Transférer ce jeu de données à un autre propriétaire.
  deleteDataset: Supprimer le jeu de données
  deleteDatasetDesc: La suppression est définitive et les données ne pourront pas être récupérées.
  deleteMsg: Voulez-vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
en:
  datasets: Datasets
  import: Import
  source: Source
  metadata: Metadata
  informations: Information
  details: Details
  schema: Schema
  attachments: Attachments
  exploration: Data exploration
  genericViews: Generic views
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
  dangerZone: Danger Zone
  changeOwner: Change owner
  changeOwnerDesc: Transfer this dataset to another owner.
  deleteDataset: Delete dataset
  deleteDatasetDesc: Deletion is permanent and data cannot be recovered.
  deleteMsg: Do you really want to delete the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import importSvg from '~/assets/svg/Data Process_Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import metadataSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiAttachment, mdiBell, mdiCalendarText, mdiCardTextOutline, mdiClipboardTextClock, mdiCodeTags, mdiContentCopy, mdiEyeArrowRight, mdiFileDownload, mdiHistory, mdiImage, mdiImageMultiple, mdiInformation, mdiKey, mdiMap, mdiPresentation, mdiSecurity, mdiTable, mdiTableCog, mdiTransitConnection, mdiWebhook } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()

const breadcrumbs = useBreadcrumbs()
const importTab = ref('source')
const metadataTab = ref('informations')
const explorationTab = ref('generic-views')
const eventsTab = ref('traceability')

const store = provideDatasetStore(route.params.id, true, 'vuetify')
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, publishedDatasetFetch, digitalDocumentField, imageField, can, remove } = store

const showOwnerDialog = ref(false)
const showDeleteDialog = ref(false)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/datasets')
}

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
  return `${window.location.origin}/events/embed/traceability?resource=${encodeURIComponent('dataset/' + dataset.value.id)}`
})

const sections = computedDeepDiff(() => {
  if (!dataset.value) return {} as Record<string, { title: string, tabs: any[] }>
  const d = dataset.value
  const result: Record<string, { title: string, tabs: any[] }> = {}

  // Import section (first in order)
  if (!d.isMetaOnly) {
    const importTabs = [
      { key: 'source', title: t('source'), icon: mdiFileDownload }
    ]
    if (can('readJournal').value) {
      importTabs.push({ key: 'journal', title: t('journal'), icon: mdiCalendarText })
    }
    result.import = { title: t('import'), tabs: importTabs }
  }

  // Metadata section
  const metadataTabs = [
    { key: 'informations', title: t('informations'), icon: mdiInformation },
    { key: 'details', title: t('details'), icon: mdiCardTextOutline }
  ]
  if (d.finalizedAt && !d.isMetaOnly) {
    metadataTabs.push({ key: 'schema', title: t('schema'), icon: mdiTableCog })
  }
  if (!d.draftReason) {
    metadataTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment })
  }
  if (d.finalizedAt || d.isMetaOnly) {
    metadataTabs.push({ key: 'related-datasets', title: t('relatedDatasets'), icon: mdiEyeArrowRight })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs }

  // Exploration section
  if (d.finalizedAt || d.draftReason) {
    const explorationTabs = []
    if (d.finalizedAt && !d.isMetaOnly) {
      explorationTabs.push({ key: 'generic-views', title: t('genericViews'), icon: mdiPresentation })
      if (!d.draftReason || d.draftReason.key === 'file-updated') {
        explorationTabs.push({ key: 'applications', title: t('applications'), icon: mdiImageMultiple })
      }
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

  // Events section
  if ($uiConfig.eventsIntegration) {
    const eventsTabs = [
      { key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock }
    ]
    eventsTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions').value) {
      eventsTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.events = { title: t('tracking'), tabs: eventsTabs }
  }

  // Danger zone section
  if (can('setOwner').value || can('delete').value) {
    result.dangerZone = { title: t('dangerZone'), tabs: [] }
  }

  return result
})

const genericViewCards = computed(() => {
  const d = dataset.value
  if (!d) return []
  const cards = [
    { key: 'table', title: t('table'), icon: mdiTable }
  ]
  if (d.bbox) cards.push({ key: 'map', title: t('map'), icon: mdiMap })
  if (digitalDocumentField.value) cards.push({ key: 'files', title: t('files'), icon: mdiContentCopy })
  if (imageField.value) cards.push({ key: 'thumbnails', title: t('thumbnails'), icon: mdiImage })
  if (d.rest?.history) cards.push({ key: 'revisions', title: t('revisions'), icon: mdiHistory })
  return cards
})

const tabModels: Record<string, Ref<string>> = {
  import: importTab,
  metadata: metadataTab,
  exploration: explorationTab,
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

<style>
</style>
