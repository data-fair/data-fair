<template>
  <v-container v-if="dataset">
    <!-- Show dataset status -->
    <dataset-status v-if="dataset.status === 'error' || !!dataset.draftReason" />

    <!-- Structure section -->
    <df-section-tabs
      v-if="sections.structure"
      id="structure"
      v-model="structureTab"
      :title="sections.structure.title"
      :tabs="sections.structure.tabs"
      :svg="buildingSvg"
    >
      <template #actions>
        <confirm-menu
          v-if="structureEditFetch.hasDiff.value"
          :btn-props="{ color: 'warning', variant: 'tonal' }"
          :label="t('cancel')"
          :text="t('confirmCancelText')"
          :icon="mdiCancel"
          yes-color="warning"
          @confirm="cancelStructure"
        />
        <v-btn
          v-if="structureEditFetch.hasDiff.value"
          class="ml-2"
          color="accent"
          variant="flat"
          :disabled="!masterDataFormValid"
          :loading="structureEditFetch.save.loading.value"
          @click="structureEditFetch.save.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </template>

      <template #windows>
        <v-tabs-window-item value="schema">
          <dataset-schema-edit
            v-if="structureEditFetch.data.value"
            v-model="structureEditFetch.data.value.schema"
            :original-schema="structureEditFetch.serverData.value?.schema"
            :primary-key="structureEditFetch.data.value.primaryKey"
            :projection="structureEditFetch.data.value.projection ?? null"
            @update:primary-key="pk => { if (structureEditFetch.data.value) structureEditFetch.data.value.primaryKey = pk }"
            @update:projection="p => { if (structureEditFetch.data.value) structureEditFetch.data.value.projection = p }"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="extensions">
          <dataset-extension
            v-if="structureEditFetch.data.value"
            v-model="structureEditFetch.data.value"
            @refresh="onRefreshExtension"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="rest-config">
          <dataset-rest-config
            v-if="structureEditFetch.data.value && dataset?.isRest"
            :rest="structureEditFetch.data.value.rest"
            :dataset="structureEditFetch.data.value"
            @update:rest="r => { if (structureEditFetch.data.value) structureEditFetch.data.value.rest = r }"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="virtual">
          <dataset-virtual
            v-if="structureEditFetch.data.value"
            v-model="structureEditFetch.data.value"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="master-data">
          <dataset-master-data
            v-if="structureEditFetch.data.value"
            v-model="structureEditFetch.data.value"
            @update:valid="v => masterDataFormValid = v"
          />
        </v-tabs-window-item>
      </template>
    </df-section-tabs>

    <!-- Metadata section -->
    <df-section-tabs
      v-if="sections.metadata"
      id="metadata"
      v-model="metadataTab"
      :title="sections.metadata.title"
      :tabs="sections.metadata.tabs"
      :svg="metadataSvg"
    >
      <template #actions>
        <confirm-menu
          v-if="metadataEditFetch.hasDiff.value"
          :btn-props="{ color: 'warning', variant: 'tonal' }"
          :label="t('cancel')"
          :text="t('confirmCancelText')"
          :icon="mdiCancel"
          yes-color="warning"
          @confirm="cancelMetadata"
        />
        <v-btn
          v-if="metadataEditFetch.hasDiff.value"
          class="ml-2"
          color="accent"
          variant="flat"
          :loading="metadataEditFetch.save.loading.value"
          @click="metadataEditFetch.save.execute()"
        >
          {{ t('save') }}
        </v-btn>
        <df-agent-chat-action
          v-if="metadataEditFetch.hasDiff.value"
          action-id="summarize-metadata-changes"
          :visible-prompt="t('summarizeChanges')"
          :hidden-context="'Summarize the pending metadata changes for this dataset using the summarize_metadata_changes tool.'"
          :btn-props="{ class: 'ml-2' }"
          :title="t('summarizeChanges')"
        />
      </template>

      <template #windows>
        <v-tabs-window-item value="informations">
          <dataset-metadata-form
            v-if="metadataEditFetch.data.value"
            v-model="metadataEditFetch.data.value"
            :server-data="metadataEditFetch.serverData.value"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="details">
          <dataset-metadata-details />
        </v-tabs-window-item>

        <v-tabs-window-item value="attachments">
          <dataset-metadata-attachments />
        </v-tabs-window-item>
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
      <template #windows>
        <v-tabs-window-item value="table">
          <dataset-table
            :height="windowHeight - 300"
            :pagination="true"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="map">
          <dataset-map :height="windowHeight - 300" />
        </v-tabs-window-item>

        <v-tabs-window-item value="files">
          <dataset-search-files :height="windowHeight - 300" />
        </v-tabs-window-item>

        <v-tabs-window-item value="thumbnails">
          <dataset-thumbnails :height="windowHeight - 300" />
        </v-tabs-window-item>

        <v-tabs-window-item value="revisions">
          <dataset-history />
        </v-tabs-window-item>

        <v-tabs-window-item value="applications">
          <v-btn
            v-if="canContribDep"
            :to="`/new-application?dataset=${dataset.id}`"
            :prepend-icon="mdiPlus"
            class="mb-4"
            color="primary"
            variant="flat"
          >
            {{ t('configureApp') }}
          </v-btn>
          <v-row v-if="applications.length">
            <v-col
              v-for="app in applications"
              :key="app.id"
              cols="12"
              sm="6"
              md="4"
            >
              <application-card :application="app" />
            </v-col>
          </v-row>
          <p v-else>
            {{ t('noApplications') }}
          </p>
        </v-tabs-window-item>
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
          <v-tabs-window-item value="catalog-publications">
            <d-frame
              :src="catalogPublicationsUrl"
              sync-params
              @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <embed-integration
              resource-type="datasets"
              :resource="dataset"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Activity section -->
    <df-section-tabs
      v-if="sections.activity"
      id="activity"
      v-model="activityTab"
      :min-height="550"
      :title="sections.activity.title"
      :tabs="sections.activity.tabs"
      :svg="settingsSvg"
      svg-no-margin
    >
      <template #content="{ tab }">
        <v-tabs-window
          :model-value="tab"
          class="pa-4"
        >
          <v-tabs-window-item value="journal">
            <journal-view
              v-if="journal"
              :journal="journal"
              :task-progress="taskProgress"
              type="dataset"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="traceability">
            <event-traceability
              resource-type="dataset"
              :resource-id="dataset.id"
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration"
            value="notifications"
          >
            <event-notifications
              :resource="dataset"
              resource-type="dataset"
            />
          </v-tabs-window-item>
          <v-tabs-window-item
            v-if="$uiConfig.eventsIntegration && can('setPermissions').value"
            value="webhooks"
          >
            <event-webhooks
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
            v-if="can('changeOwner').value"
            :prepend-icon="mdiAccountSwitch"
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
            v-if="can('changeOwner').value && (canDeleteAllLines || can('delete').value)"
          />

          <v-list-item
            v-if="canDeleteAllLines"
            :prepend-icon="mdiDeleteSweep"
            class="py-4"
          >
            <div>
              <div class="text-body-1 font-weight-bold">
                {{ t('deleteAllLines') }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('deleteAllLinesDesc') }}
              </div>
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="showDeleteAllLinesDialog = true"
              >
                {{ t('deleteAllLines') }}
              </v-btn>
            </template>
          </v-list-item>

          <v-divider
            v-if="canDeleteAllLines && can('delete').value"
          />

          <v-list-item
            v-if="can('delete').value"
            :prepend-icon="mdiDelete"
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
      v-if="can('changeOwner').value"
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

    <v-dialog
      v-model="showDeleteAllLinesDialog"
      max-width="500"
    >
      <v-card :title="t('deleteAllLinesTitle')">
        <v-card-text>
          <v-alert
            type="error"
            variant="outlined"
          >
            {{ t('deleteAllLinesWarning', { title: dataset?.title }) }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            @click="showDeleteAllLinesDialog = false"
          >
            {{ t('no') }}
          </v-btn>
          <v-btn
            color="warning"
            variant="flat"
            @click="confirmDeleteAllLines"
          >
            {{ t('yes') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <df-navigation-right>
      <dataset-actions />
      <v-list
        v-if="taskProgress?.task"
        density="compact"
        class="py-0"
        bg-color="background"
      >
        <dataset-task-progress :task-progress="taskProgress" />
      </v-list>
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  structure: Structure
  extensions: Enrichissements
  restConfig: Jeu éditable
  masterData: Données de référence
  virtual: Jeu de données virtuel
  saved: Les modifications ont été enregistrées
  metadata: Métadonnées
  informations: Informations
  details: Détails
  schema: Schéma
  attachments: Pièces jointes
  save: Enregistrer
  cancel: Annuler
  confirmCancelText: Souhaitez-vous annuler vos modifications ?
  summarizeChanges: Résumer les modifications
  exploration: Exploration des données
  table: Tableau
  map: Carte
  files: Fichiers
  thumbnails: Vignettes
  revisions: Révisions
  applications: Applications
  configureApp: Configurer une application
  noApplications: Aucune application n'utilise ce jeu de données.
  relatedDatasets: Voir aussi
  share: Permissions & partage
  permissions: Permissions
  readApiKey: Clé d'API en lecture
  publicationSites: Portails
  catalogPublications: Catalogues distants
  integration: Intégrer dans un site
  tracking: Suivi
  journal: Journal
  traceability: Traçabilité
  notifications: Notifications
  webhooks: Webhooks
  dangerZone: Zone de danger
  changeOwner: Changer le propriétaire
  changeOwnerDesc: Transférer ce jeu de données à un autre propriétaire.
  deleteAllLines: Supprimer toutes les lignes
  deleteAllLinesDesc: Supprime toutes les lignes du jeu de données. Cette action est irréversible.
  deleteAllLinesTitle: Suppression des lignes du jeu de données
  deleteAllLinesWarning: Voulez-vous vraiment supprimer toutes les lignes du jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  deleteDataset: Supprimer le jeu de données
  deleteDatasetDesc: La suppression est définitive et les données ne pourront pas être récupérées.
  deleteMsg: Voulez-vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
en:
  datasets: Datasets
  structure: Structure
  extensions: Extensions
  restConfig: REST Configuration
  masterData: Master data
  virtual: Virtual dataset
  saved: Changes were saved
  metadata: Metadata
  informations: Information
  details: Details
  schema: Schema
  attachments: Attachments
  save: Save
  cancel: Cancel
  confirmCancelText: Do you want to discard your changes?
  summarizeChanges: Summarize changes
  exploration: Data exploration
  table: Table
  map: Map
  files: Files
  thumbnails: Thumbnails
  revisions: Revisions
  applications: Applications
  configureApp: Configure an application
  noApplications: No application uses this dataset.
  relatedDatasets: See also
  share: Share
  permissions: Permissions
  readApiKey: Read API key
  publicationSites: Portals
  catalogPublications: Remote catalogs
  integration: Embed in a website
  tracking: Tracking
  journal: Journal
  traceability: Traceability
  notifications: Notifications
  webhooks: Webhooks
  dangerZone: Danger Zone
  changeOwner: Change owner
  changeOwnerDesc: Transfer this dataset to another owner.
  deleteAllLines: Delete all lines
  deleteAllLinesDesc: Delete all the lines of the dataset. This action is irreversible.
  deleteAllLinesTitle: Delete all the lines of the dataset
  deleteAllLinesWarning: Do you really want to delete all the lines of the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  deleteDataset: Delete dataset
  deleteDatasetDesc: Deletion is permanent and data cannot be recovered.
  deleteMsg: Do you really want to delete the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import metadataSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import DatasetRestConfig from '~/components/dataset/dataset-rest-config.vue'
import { mdiAccountSwitch, mdiAlertCircle, mdiAttachment, mdiBell, mdiCalendarText, mdiCancel, mdiCardTextOutline, mdiClipboardTextClock, mdiCodeTags, mdiContentCopy, mdiDatabase, mdiDelete, mdiDeleteSweep, mdiHistory, mdiImage, mdiImageMultiple, mdiInformation, mdiKey, mdiMap, mdiPlus, mdiPresentation, mdiPuzzle, mdiSecurity, mdiSetAll, mdiTable, mdiTableCog, mdiTransitConnection, mdiWebhook } from '@mdi/js'
import equal from 'fast-deep-equal'
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { usePermissions } from '~/composables/use-permissions'
import { useAgentDatasetSummaryTools } from '~/composables/dataset/agent-summary-tools'
import { useAgentDatasetDescriptionTools } from '~/composables/dataset/agent-description-tools'
import { useAgentDatasetChangesSummaryTools } from '~/composables/dataset/agent-changes-summary-tools'
import { useAgentExpressionTools } from '~/composables/dataset/agent-expression-tools'
import { useAgentSchemaAnnotationTools } from '~/composables/dataset/agent-schema-annotation-tools'
import { useAgentPropertyConfigTools } from '~/composables/dataset/agent-property-config-tools'

const { t, locale } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()
const { accountRole } = useSessionAuthenticated()
const { canContribDep } = usePermissions()
const { height: windowHeight } = useWindowSize()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('informations')
const explorationTab = ref('table')
const activityTab = ref('journal')
const structureTab = ref('schema')

const store = provideDatasetStore(route.params.id, true, 'vuetify')
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, publishedDatasetFetch, digitalDocumentField, imageField, can, id, remove } = store

// Separate editFetch for structure (schema, primaryKey, rest, projection, extensions)
const structureEditFetch = useEditFetch<any>(`${$apiPath}/datasets/${route.params.id}`, {
  query: { draft: true },
  patch: true,
  saveOptions: {
    success: t('saved')
  }
})

// Separate editFetch for metadata (all other descriptive fields)
const metadataEditFetch = useEditFetch<any>(`${$apiPath}/datasets/${route.params.id}`, {
  query: { draft: true },
  patch: true,
  saveOptions: {
    success: t('saved')
  }
})

// Normalize structure data to prevent false diffs from child component initialization
function normalizeStructureData (d: any) {
  if (!d) return
  d.extensions = (d.extensions || []).filter((e: any) => e.active !== false)
  if (!d.masterData) d.masterData = { standardSchema: {}, virtualDatasets: {}, singleSearchs: [], bulkSearchs: [] }
}

const masterDataFormValid = ref(true)

// Sync store.dataset with both editFetch instances
watch(structureEditFetch.serverData, (d) => {
  if (d) {
    normalizeStructureData(d)
    normalizeStructureData(structureEditFetch.data.value)
    dataset.value = d as any
  }
})
watch(metadataEditFetch.serverData, (d) => {
  if (d) dataset.value = d as any
})

// Sync store.dataset.image back to metadataEditFetch when changed externally (e.g. thumbnail set from attachments tab)
watch(() => dataset.value?.image, (newImage) => {
  if (metadataEditFetch.serverData.value && metadataEditFetch.serverData.value.image !== newImage) {
    const wasUnchanged = metadataEditFetch.data.value?.image === metadataEditFetch.serverData.value.image
    metadataEditFetch.serverData.value.image = newImage
    if (wasUnchanged && metadataEditFetch.data.value) {
      metadataEditFetch.data.value.image = newImage
    }
  }
})

// Leave guards for unsaved changes
useLeaveGuard(structureEditFetch.hasDiff, { locale })
useLeaveGuard(metadataEditFetch.hasDiff, { locale })

// Agent tools for metadata editing
useAgentDatasetSummaryTools(locale, metadataEditFetch.data, (s) => {
  if (metadataEditFetch.data.value) metadataEditFetch.data.value.summary = s
})
useAgentDatasetDescriptionTools(locale, (d) => {
  if (metadataEditFetch.data.value) metadataEditFetch.data.value.description = d
})
useAgentDatasetChangesSummaryTools(locale, metadataEditFetch.data, metadataEditFetch.serverData)
useAgentExpressionTools(locale, structureEditFetch.data, (extensionIndex, expr) => {
  if (structureEditFetch.data.value?.extensions?.[extensionIndex]) {
    structureEditFetch.data.value.extensions[extensionIndex].expr = expr
  }
})
useAgentSchemaAnnotationTools(locale, structureEditFetch.data, (annotations) => {
  if (!structureEditFetch.data.value?.schema) return
  for (const ann of annotations) {
    const prop = structureEditFetch.data.value.schema.find((p: any) => p.key === ann.key)
    if (prop) {
      if (ann.title !== undefined) prop.title = ann.title
      if (ann.description !== undefined) prop.description = ann.description
    }
  }
})
useAgentPropertyConfigTools(locale, structureEditFetch.data, (configs) => {
  if (!structureEditFetch.data.value?.schema) return
  for (const cfg of configs) {
    const prop = structureEditFetch.data.value.schema.find((p: any) => p.key === cfg.key)
    if (!prop) continue
    if (cfg.typeOverride !== undefined) {
      if (cfg.typeOverride === null) {
        if (prop['x-transform']) {
          delete prop['x-transform'].type
          delete prop['x-transform'].format
          if (!prop['x-transform'].expr) delete prop['x-transform']
        }
      } else {
        if (!prop['x-transform']) prop['x-transform'] = {}
        prop['x-transform'].type = cfg.typeOverride.type
        if (cfg.typeOverride.format) prop['x-transform'].format = cfg.typeOverride.format
        else delete prop['x-transform'].format
      }
    }
    if (cfg.capabilities !== undefined) {
      if (cfg.capabilities === null || !Object.keys(cfg.capabilities).length) {
        delete prop['x-capabilities']
      } else {
        prop['x-capabilities'] = cfg.capabilities
      }
    }
  }
})

// Cancel functions for both editFetch instances
const cancelStructure = () => {
  structureEditFetch.data.value = JSON.parse(JSON.stringify(structureEditFetch.serverData.value))
}
const cancelMetadata = () => {
  metadataEditFetch.data.value = JSON.parse(JSON.stringify(metadataEditFetch.serverData.value))
}

const onRefreshExtension = async (extension: any) => {
  await store.patchDataset.execute({ extensions: [{ ...extension, needsUpdate: true }] })
  await structureEditFetch.fetch.refresh()
}

const showOwnerDialog = ref(false)
const showDeleteDialog = ref(false)
const showDeleteAllLinesDialog = ref(false)

const canDeleteAllLines = computed(() => dataset.value?.isRest && can('deleteLine').value)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/datasets')
}

const confirmDeleteAllLines = async () => {
  showDeleteAllLinesDialog.value = false
  await $fetch(`datasets/${id}/lines`, { method: 'DELETE' })
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
  if (can('readJournal').value && !d.isMetaOnly && !journalFetch.initialized.value) journalFetch.refresh()
  if (!taskProgressFetch.initialized.value) taskProgressFetch.refresh()
  if (d.finalizedAt && !applicationsFetch.initialized.value) applicationsFetch.refresh()
  if (d.draftReason?.key === 'file-updated' && !publishedDatasetFetch.initialized.value) publishedDatasetFetch.refresh()
}, { immediate: true })

const applications = computed(() => applicationsFetch.data.value?.results ?? [])

const catalogPublicationsUrl = computed(() => {
  if (!dataset.value) return ''
  return `${window.location.origin}/catalogs/dataset-publications?dataset-id=${dataset.value.id}`
})

// Diff-detection computeds for structure tabs
const schemaHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.schema, s.schema) || !equal(d.primaryKey, s.primaryKey) || !equal(d.projection, s.projection)
})

const extensionsHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.extensions, s.extensions)
})

const restHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.rest, s.rest)
})

const masterDataHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.masterData, s.masterData)
})

const virtualHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.virtual, s.virtual) || !equal(d.schema, s.schema)
})

const sections = computedDeepDiff(() => {
  if (!dataset.value) return {} as Record<string, { title: string, tabs: any[] }>
  const d = dataset.value
  const result: Record<string, { title: string, tabs: any[] }> = {}

  // Structure section (new)
  if (can('writeDescriptionBreaking').value && (d.finalizedAt || d.isVirtual)) {
    const structureTabs: any[] = [{
      key: 'schema',
      title: t('schema'),
      icon: mdiTableCog,
      color: schemaHasDiff.value ? 'accent' : undefined
    }]

    if (!d.isVirtual && !d.isMetaOnly) {
      structureTabs.push({
        key: 'extensions',
        title: t('extensions'),
        icon: mdiPuzzle,
        color: extensionsHasDiff.value ? 'accent' : undefined
      })
    }

    if (d.isRest) {
      structureTabs.push({
        key: 'rest-config',
        title: t('restConfig'),
        icon: mdiTableCog,
        color: restHasDiff.value ? 'accent' : undefined
      })
    }

    if (d.isVirtual) {
      structureTabs.push({
        key: 'virtual',
        title: t('virtual'),
        icon: mdiSetAll,
        color: virtualHasDiff.value ? 'accent' : undefined
      })
    }

    if (!d.draftReason && !d.isMetaOnly && accountRole.value === 'admin') {
      structureTabs.push({
        key: 'master-data',
        title: t('masterData'),
        icon: mdiDatabase,
        color: !masterDataFormValid.value ? 'error' : (masterDataHasDiff.value ? 'accent' : undefined),
        appendIcon: !masterDataFormValid.value ? mdiAlertCircle : undefined
      })
    }

    result.structure = { title: t('structure'), tabs: structureTabs }
  }

  // Metadata section
  const metadataTabs = [
    { key: 'informations', title: t('informations'), icon: mdiInformation, color: metadataEditFetch.hasDiff.value ? 'accent' : undefined },
    { key: 'details', title: t('details'), icon: mdiCardTextOutline }
  ]
  if (!d.draftReason) {
    metadataTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs }

  // Exploration section (direct component tabs)
  if (d.finalizedAt && !d.isMetaOnly) {
    const explorationTabs = [
      { key: 'table', title: t('table'), icon: mdiTable }
    ]
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
    if ($uiConfig.catalogsIntegration && accountRole.value === 'admin') {
      shareTabs.push({ key: 'catalog-publications', title: t('catalogPublications'), icon: mdiTransitConnection })
    }
    if (d.finalizedAt) {
      shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags })
    }
    if (shareTabs.length) {
      result.share = { title: t('share'), tabs: shareTabs }
    }
  }

  // Activity section
  const activityTabs = []
  if (can('readJournal').value && !d.isMetaOnly) {
    activityTabs.push({ key: 'journal', title: t('journal'), icon: mdiCalendarText })
  }
  if ($uiConfig.eventsIntegration) {
    activityTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock })
    activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions').value) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.activity = { title: t('tracking'), tabs: activityTabs }
  }

  // Danger zone section
  if (can('changeOwner').value || canDeleteAllLines.value || can('delete').value) {
    result.dangerZone = { title: t('dangerZone'), tabs: [] }
  }

  return result
})

const tocSections = computed(() => {
  return Object.entries(sections.value).map(([id, s]) => ({
    id: id === 'dangerZone' ? 'danger-zone' : id,
    title: s.title
  }))
})
</script>
