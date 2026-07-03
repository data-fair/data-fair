<template>
  <v-container v-if="dataset">
    <!-- Show dataset status -->
    <dataset-status v-if="dataset.status === 'error' || !!dataset.draftReason" />

    <!-- Metadata details -->
    <df-section-tabs
      v-if="sections.informations"
      id="informations"
      :title="sections.informations.title"
      :subtitle="sections.informations.subtitle"
      :svg="informationsSvg"
    >
      <template #windows>
        <dataset-metadata-details class="mb-4" />
      </template>
    </df-section-tabs>

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
          v-if="structureHasRealDiff"
          :btn-props="{ color: 'warning', variant: 'tonal' }"
          :label="t('cancel')"
          :text="t('confirmCancelText')"
          :icon="mdiCancel"
          yes-color="warning"
          @confirm="cancelStructure"
        />
        <v-btn
          v-if="structureHasRealDiff"
          class="ml-2"
          color="accent"
          variant="flat"
          :disabled="!masterDataFormValid || hasInvalidExtension"
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
            :conforms-to="structureEditFetch.data.value.conformsTo ?? null"
            :original-conforms-to="structureEditFetch.serverData.value?.conformsTo ?? null"
            :owner="dataset?.owner ?? null"
            :conforms-to-active="!!datasetsMetadata?.conformsTo?.active"
            @update:primary-key="pk => { if (structureEditFetch.data.value) structureEditFetch.data.value.primaryKey = pk }"
            @update:projection="p => { if (structureEditFetch.data.value) structureEditFetch.data.value.projection = p }"
            @update:conforms-to="c => { if (structureEditFetch.data.value) structureEditFetch.data.value.conformsTo = c }"
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
            :server-rest="structureEditFetch.serverData.value?.rest"
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
        <v-tabs-window-item
          value="table"
          class="rounded border overflow-hidden"
        >
          <dataset-table
            :height="windowHeight - 300"
            :pagination="true"
          />
        </v-tabs-window-item>

        <v-tabs-window-item
          value="map"
          class="rounded border overflow-hidden"
        >
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
      v-model="shareTab"
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
            <permissions-editor
              v-if="dataset"
              :model-value="permissions"
              :resource="dataset"
              resource-type="datasets"
              :disabled="!can('setPermissions').value"
              @save="onSavePermissions"
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
              :key="catalogPublicationsKey"
              :src="catalogPublicationsUrl"
              sync-params
              @notif="(msg: any) => sendUiNotif({ type: msg.type || 'success', msg: msg.title })"
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

    <!-- Diagnose section (superadmin only) -->
    <df-section-tabs
      v-if="sections.diagnose"
      id="diagnose"
      v-model="diagnoseTab"
      :svg="dataMaintenanceSvg"
      svg-no-margin
      color="admin"
      :title="sections.diagnose.title"
      :subtitle="sections.diagnose.subtitle"
      :tabs="sections.diagnose.tabs"
    >
      <template #actions>
        <v-btn
          :prepend-icon="mdiRefresh"
          :loading="diagnoseRef?.loading"
          size="small"
          variant="text"
          @click="diagnoseRef?.refresh()"
        >
          {{ t('refresh') }}
        </v-btn>
      </template>
      <template #content="{ tab }">
        <dataset-diagnose
          ref="diagnoseRef"
          :tab="tab"
        />
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
        <v-list class="py-0">
          <v-list-item
            v-if="can('changeOwner').value"
            :prepend-icon="mdiAccountSwitch"
            class="py-4"
          >
            <div class="text-body-1 font-weight-bold">
              {{ t('changeOwner') }}
            </div>
            <div class="text-body-medium text-medium-emphasis">
              {{ t('changeOwnerDesc') }}
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

          <v-divider v-if="can('changeOwner').value && (can('writePartOf').value || canDeleteAllLines || can('delete').value)" />

          <v-list-item
            v-if="can('writePartOf').value"
            :prepend-icon="mdiFamilyTree"
            class="py-4"
          >
            <div class="text-body-1 font-weight-bold">
              {{ t('partOf') }}
            </div>
            <div class="text-body-medium text-medium-emphasis">
              <i18n-t
                v-if="dataset?.partOf"
                keypath="partOfCurrentDesc"
                tag="span"
              >
                <template #title>
                  <router-link :to="`/${dataset.partOf.type === 'dataset' ? 'dataset' : 'application'}/${dataset.partOf.id}`">
                    {{ dataset.partOf.title }}
                  </router-link>
                </template>
              </i18n-t>
              <template v-else>
                {{ t('partOfDesc') }}
              </template>
            </div>
            <template #append>
              <part-of-dialog
                v-if="dataset"
                v-model="showPartOfDialog"
                resource-type="datasets"
                :resource="dataset"
                :candidates="partOfCandidates"
                :candidates-loading="partOfCandidatesLoading"
                @changed="store.datasetFetch.refresh()"
              >
                <template #activator="{ props: activatorProps }">
                  <v-btn
                    v-bind="activatorProps"
                    variant="outlined"
                    color="error"
                    class="ml-4 align-self-center"
                    @click="openPartOfDialog"
                  >
                    {{ dataset?.partOf ? t('partOfUnset') : t('partOfDefine') }}
                  </v-btn>
                </template>
              </part-of-dialog>
            </template>
          </v-list-item>

          <v-divider v-if="can('writePartOf').value && (canDeleteAllLines || can('delete').value)" />

          <v-list-item
            v-if="canDeleteAllLines"
            :prepend-icon="mdiDeleteSweep"
            class="py-4"
          >
            <div class="text-body-1 font-weight-bold">
              {{ t('deleteAllLines') }}
            </div>
            <div class="text-body-medium text-medium-emphasis">
              {{ t('deleteAllLinesDesc') }}
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

          <v-divider v-if="canDeleteAllLines && can('delete').value" />

          <v-list-item
            v-if="can('delete').value"
            :prepend-icon="mdiDelete"
            class="py-4"
          >
            <div>
              <div class="text-body-1 font-weight-bold">
                {{ t('deleteDataset') }}
              </div>
              <div class="text-body-medium text-medium-emphasis">
                {{ t('deleteDatasetDesc') }}
              </div>
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="openDeleteDialog"
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
      @changed="store.datasetFetch.refresh()"
    />

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card
        :title="t('deleteDataset')"
        :loading="confirmRemove.loading.value ? 'warning' : undefined"
      >
        <v-card-text class="pb-0">
          {{ t('deleteMsg', { title: dataset?.title }) }}
          <template v-if="childrenCount > 0">
            <v-alert
              type="warning"
              variant="outlined"
              density="compact"
              class="mt-4"
            >
              {{ t('childrenWarning', childrenCount) }}
            </v-alert>
            <v-radio-group
              v-model="childrenAction"
              class="mt-2"
              hide-details
            >
              <v-radio
                :label="t('childrenActionUnflag')"
                value="unflag"
              />
              <v-radio
                :label="t('childrenActionDelete')"
                value="delete"
              />
            </v-radio-group>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :disabled="confirmRemove.loading.value"
            @click="showDeleteDialog = false"
          >
            {{ t('no') }}
          </v-btn>
          <v-btn
            color="warning"
            variant="flat"
            :loading="confirmRemove.loading.value"
            @click="confirmRemove.execute()"
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
      <v-card
        :title="t('deleteAllLinesTitle')"
        :loading="confirmDeleteAllLines.loading.value ? 'warning' : undefined"
      >
        <v-card-text class="pb-0">
          {{ t('deleteAllLinesWarning', { title: dataset?.title }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :disabled="confirmDeleteAllLines.loading.value"
            @click="showDeleteAllLinesDialog = false"
          >
            {{ t('no') }}
          </v-btn>
          <v-btn
            color="warning"
            variant="flat"
            :loading="confirmDeleteAllLines.loading.value"
            @click="confirmDeleteAllLines.execute()"
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
        <dataset-task-progress
          :task-progress="taskProgress"
          compact
        />
      </v-list>
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  informationsSubtitle: Retrouvez les informations générales et techniques du jeu de données.
  structure: Structure
  extensions: Enrichissements
  restConfig: Jeu éditable
  masterData: Données de référence
  virtual: Jeu de données virtuel
  saved: Les modifications ont été enregistrées
  permissionsUpdated: Les permissions ont été mises à jour
  metadata: Métadonnées
  informations: Informations
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
  diagnose: Diagnostic
  diagnoseSubtitle: Informations techniques pour les administrateurs.
  diagnoseTabEs: Elasticsearch
  diagnoseTabLocks: Verrous
  diagnoseTabRaw: JSON brut
  refresh: Rafraîchir
  dangerZone: Zone de danger
  changeOwner: Changer le propriétaire
  changeOwnerDesc: Transférer ce jeu de données à un autre propriétaire.
  partOf: Ressource parente
  partOfDefine: Définir comme enfant
  partOfUnset: Retirer l'attribut enfant
  partOfDesc: Définir ce jeu de données comme n'existant que pour servir une ressource parente (jeu de données virtuel ou application).
  partOfCurrentDesc: "Ce jeu de données est actuellement défini comme enfant de : {title}"
  deleteAllLines: Supprimer toutes les lignes
  deleteAllLinesDesc: Supprime toutes les lignes du jeu de données. Cette action est irréversible.
  deleteAllLinesTitle: Suppression des lignes du jeu de données
  deleteAllLinesWarning: Voulez-vous vraiment supprimer toutes les lignes du jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  deleteDataset: Supprimer le jeu de données
  deleteDatasetDesc: La suppression est définitive et les données ne pourront pas être récupérées.
  deleteMsg: Voulez-vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  childrenWarning: aucun jeu de données enfant | Ce jeu de données a un jeu de données enfant qui n'existe que dans ce cadre. | Ce jeu de données a {count} jeux de données enfants qui n'existent que dans ce cadre.
  childrenActionUnflag: Conserver les jeux enfants en leur retirant l'attribut enfant
  childrenActionDelete: Supprimer aussi les jeux enfants
  deleteDatasetSuccess: Le jeu de données a bien été supprimé.
  deleteAllLinesSuccess: Toutes les lignes ont bien été supprimées.
  yes: Oui
  no: Non
en:
  datasets: Datasets
  informationsSubtitle: Find the general and technical information for this dataset.
  structure: Structure
  extensions: Extensions
  restConfig: REST Configuration
  masterData: Master data
  virtual: Virtual dataset
  saved: Changes were saved
  permissionsUpdated: Permissions were updated
  metadata: Metadata
  informations: Information
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
  diagnose: Diagnose
  diagnoseSubtitle: Technical information for superadmins.
  diagnoseTabEs: Elasticsearch
  diagnoseTabLocks: Locks
  diagnoseTabRaw: Raw JSON
  refresh: Refresh
  dangerZone: Danger Zone
  changeOwner: Change owner
  changeOwnerDesc: Transfer this dataset to another owner.
  partOf: Parent resource
  partOfDefine: Define as child
  partOfUnset: Remove the child attribute
  partOfDesc: Define this dataset as existing only to serve a parent resource (virtual dataset or application).
  partOfCurrentDesc: "This dataset is currently defined as a child of: {title}"
  deleteAllLines: Delete all lines
  deleteAllLinesDesc: Delete all the lines of the dataset. This action is irreversible.
  deleteAllLinesTitle: Delete all the lines of the dataset
  deleteAllLinesWarning: Do you really want to delete all the lines of the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  deleteDataset: Delete dataset
  deleteDatasetDesc: Deletion is permanent and data cannot be recovered.
  deleteMsg: Do you really want to delete the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  childrenWarning: no child dataset | This dataset has a child dataset that only exists within this context. | This dataset has {count} child datasets that only exist within this context.
  childrenActionUnflag: Keep the child datasets and remove their child attribute
  childrenActionDelete: Also delete the child datasets
  deleteDatasetSuccess: Dataset was deleted successfully.
  deleteAllLinesSuccess: All lines were deleted successfully.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import informationsSvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import metadataSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import dataMaintenanceSvg from '~/assets/svg/Data maintenance_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import DatasetRestConfig from '~/components/dataset/rest/dataset-rest-config.vue'
import { mdiAccountSwitch, mdiAlertCircle, mdiAllInclusive, mdiAttachment, mdiBell, mdiCalendarText, mdiCancel, mdiClipboardTextClock, mdiCodeJson, mdiCodeTags, mdiContentCopy, mdiDatabaseSearch, mdiDelete, mdiDeleteSweep, mdiFamilyTree, mdiHistory, mdiImage, mdiImageMultiple, mdiInformation, mdiKey, mdiLock, mdiMap, mdiPictureInPictureBottomRightOutline, mdiPlus, mdiPresentation, mdiPuzzle, mdiRefresh, mdiSecurity, mdiStarFourPoints, mdiTable, mdiTableCog, mdiTransitConnection, mdiWebhook } from '@mdi/js'
import equal from 'fast-deep-equal'
import { useWindowSize } from '@vueuse/core'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { usePermissions } from '~/composables/use-permissions'
import { useAgentDatasetSummaryTools } from '~/composables/dataset/agent-summary-tools'
import { useAgentDatasetDescriptionTools } from '~/composables/dataset/agent-description-tools'
import { useAgentDatasetChangesSummaryTools } from '~/composables/dataset/agent-changes-summary-tools'
import { useAgentExpressionTools } from '~/composables/dataset/agent-expression-tools'
import { useAgentSchemaAnnotationTools } from '~/composables/dataset/agent-schema-annotation-tools'
import { useAgentPropertyConfigTools } from '~/composables/dataset/agent-property-config-tools'
import { useAgentDatasetPageGuidance } from '~/composables/dataset/agent-page-guidance-tools'
import { hasInvalidExprEvalExtension, hasInvalidRemoteServiceExtension } from '~/composables/dataset/expr-eval-validation'

const { t, locale } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()
const { accountRole } = useSessionAuthenticated()
const session = useSession()
const adminMode = computed(() => !!session.state.user?.adminMode)
const { canContribDep } = usePermissions()
const { height: windowHeight } = useWindowSize()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('informations')
const explorationTab = ref('table')
const activityTab = ref('journal')
const structureTab = ref('schema')
const shareTab = ref('')
const diagnoseTab = ref('elasticsearch')
const catalogPublicationsKey = ref(0)
watch(shareTab, (tab) => {
  if (tab === 'catalog-publications') catalogPublicationsKey.value++
})

const store = useDatasetStore()
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, virtualDatasetsFetch, publishedDatasetFetch, datasetsMetadataFetch, digitalDocumentField, imageField, can, id, remove, permissions, permissionsFetch, savePermissions, applyEditFetchSnapshot } = store

const datasetsMetadata = datasetsMetadataFetch.data

const onSavePermissions = async (newPermissions: import('#api/types').Permission[]) => {
  await savePermissions(newPermissions)
  sendUiNotif({ type: 'success', msg: t('permissionsUpdated') })
}

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
  if (!d.masterData) d.masterData = {}
  if (!d.masterData.standardSchema) d.masterData.standardSchema = {}
  if (!d.masterData.virtualDatasets) d.masterData.virtualDatasets = {}
  if (!d.masterData.singleSearchs) d.masterData.singleSearchs = []
  if (!d.masterData.bulkSearchs) d.masterData.bulkSearchs = []
  if (!d.masterData.shareOrgs) d.masterData.shareOrgs = []
  if (d.virtual) {
    d.virtual.children = d.virtual.children || []
    d.virtual.filters = d.virtual.filters || []
  }
}

const masterDataFormValid = ref(true)
const hasInvalidExtension = computed(() =>
  hasInvalidExprEvalExtension(structureEditFetch.data.value) ||
  hasInvalidRemoteServiceExtension(structureEditFetch.data.value)
)

// Sync store.dataset with both editFetch instances
watch(structureEditFetch.serverData, (d) => {
  if (d) {
    normalizeStructureData(d)
    normalizeStructureData(structureEditFetch.data.value)
    applyEditFetchSnapshot(d as any)
  }
})
watch(metadataEditFetch.serverData, (d) => {
  if (d) applyEditFetchSnapshot(d as any)
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
const diagnoseRef = useTemplateRef<{ refresh: () => void, loading: boolean }>('diagnoseRef')

const canDeleteAllLines = computed(() => dataset.value?.isRest && can('deleteLine').value)

const showPartOfDialog = ref(false)
const partOfCandidates = computed(() => [
  ...(virtualDatasetsFetch.data.value?.results ?? []).map(d => ({ type: 'dataset' as const, id: d.id, title: d.title })),
  ...(applicationsFetch.data.value?.results ?? []).map(a => ({ type: 'application' as const, id: a.id, title: a.title }))
])
const partOfCandidatesLoading = computed(() => virtualDatasetsFetch.loading.value || applicationsFetch.loading.value)
const openPartOfDialog = () => {
  virtualDatasetsFetch.refresh()
  if (!applicationsFetch.initialized.value) applicationsFetch.refresh()
}

const childrenCount = ref(0)
const childrenAction = ref<'delete' | 'unflag'>('unflag')
const openDeleteDialog = async () => {
  showDeleteDialog.value = true
  childrenAction.value = 'unflag'
  const res = await $fetch<{ count: number }>('datasets', { query: { partOf: id, size: 0 } })
  childrenCount.value = res.count
}

const confirmRemove = useAsyncAction(async () => {
  await remove(childrenCount.value > 0 ? childrenAction.value : undefined)
  await router.push('/datasets')
}, { success: t('deleteDatasetSuccess') })

const confirmDeleteAllLines = useAsyncAction(async () => {
  showDeleteAllLinesDialog.value = false
  await $fetch(`datasets/${id}/lines`, { method: 'DELETE' })
}, { success: t('deleteAllLinesSuccess') })

useDatasetWatch(store, ['journal', 'info', 'taskProgress'])

// Re-sync editFetch instances when the store refreshes (e.g., after finalize-end, analyze-end)
watch(store.datasetFetch.data, () => {
  if (!structureHasRealDiff.value) structureEditFetch.fetch.refresh()
  if (!metadataEditFetch.hasDiff.value) metadataEditFetch.fetch.refresh()
})

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
  if (can('getPermissions').value && (!d.draftReason || d.draftReason.key === 'file-updated') && !permissionsFetch.initialized.value) permissionsFetch.refresh()
  if (can('readJournal').value && !taskProgressFetch.initialized.value) taskProgressFetch.refresh()
  if (d.finalizedAt && !applicationsFetch.initialized.value) applicationsFetch.refresh()
  if (d.draftReason?.key === 'file-updated' && !publishedDatasetFetch.initialized.value) publishedDatasetFetch.refresh()
  if (!datasetsMetadataFetch.initialized.value) datasetsMetadataFetch.refresh()
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
  return !equal(d.schema, s.schema) ||
    !equal(d.primaryKey, s.primaryKey) ||
    !equal(d.projection, s.projection) ||
    !equal(d.conformsTo, s.conformsTo)
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

// Check if a value is an empty default (undefined, null, empty array, or empty object)
function isEmptyDefault (val: any) {
  if (val == null) return true
  if (Array.isArray(val)) return val.length === 0
  if (typeof val === 'object') return Object.keys(val).length === 0
  return false
}

const masterDataHasDiff = computed(() => {
  const d = structureEditFetch.data.value?.masterData
  const s = structureEditFetch.serverData.value?.masterData
  if (!d && !s) return false
  // Compare property by property, ignoring values that go from empty to empty
  const allKeys = new Set([...Object.keys(d || {}), ...Object.keys(s || {})])
  for (const key of allKeys) {
    const dVal = d?.[key]
    const sVal = s?.[key]
    if (isEmptyDefault(dVal) && isEmptyDefault(sVal)) continue
    if (!equal(dVal, sVal)) return true
  }
  return false
})

const virtualHasDiff = computed(() => {
  const d = structureEditFetch.data.value
  const s = structureEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.virtual, s.virtual) || !equal(d.schema, s.schema)
})

const structureHasRealDiff = computed(() => schemaHasDiff.value || extensionsHasDiff.value || restHasDiff.value || masterDataHasDiff.value || virtualHasDiff.value)

// Leave guards for unsaved changes
useLeaveGuard(structureHasRealDiff, { locale })
useLeaveGuard(metadataEditFetch.hasDiff, { locale })

const sections = computedDeepDiff(() => {
  if (!dataset.value) return {}
  const d = dataset.value
  const result: Record<string, { title: string, tabs?: any[], subtitle?: string, agentDesc?: string }> = {}

  // Informations section
  result.informations = {
    title: t('informations'),
    subtitle: t('informationsSubtitle'),
    agentDesc: 'Read-only summary of the dataset: owner, record count, source file (for file datasets), key dates (creation, last data update, last metadata update), processing status. No edit controls here — descriptive metadata is edited in the Metadata section below.'
  }

  // Structure section (new)
  if (can('writeDescriptionBreaking').value && (d.finalizedAt || d.isVirtual)) {
    const structureTabs: any[] = [{
      key: 'schema',
      title: t('schema'),
      icon: mdiTableCog,
      color: schemaHasDiff.value ? 'accent' : undefined,
      agentDesc: 'Columns list with their types, formats and indexing capabilities. For REST datasets: add/remove columns and set the primary key. Optional geo projection selector. Optionally a "conformsTo" editor at the top to declare schemas the dataset conforms to. Toolbar help buttons: **Annotate schema** (suggest titles/descriptions) → `schema_annotator`; **Configure properties** (type overrides, indexing capabilities) → `property_config_advisor`.'
    }]

    if (!d.isVirtual && !d.isMetaOnly) {
      structureTabs.push({
        key: 'extensions',
        title: t('extensions'),
        icon: mdiPuzzle,
        color: extensionsHasDiff.value ? 'accent' : undefined,
        agentDesc: '**Column-value transformations and row enrichments live here.** Two extension types: (a) remote-service extensions calling external REST APIs (geocoding, SIRENE lookup, geo enrichment, etc.); (b) expr-eval calculated columns (PAD_LEFT, CONCAT, SUBSTRING, REPLACE, TRANSFORM_DATE, MD5, JSON_PARSE, …). Add via the "Add extension" menu. For expr-eval, opening an extension card\'s edit dialog reveals the expression input with a help button next to it → `expression_helper` subagent (writes and tests the expression against sample data).'
      })
    }

    if (d.isRest) {
      structureTabs.push({
        key: 'rest-config',
        title: t('restConfig'),
        icon: mdiAllInclusive,
        color: restHasDiff.value ? 'accent' : undefined,
        agentDesc: 'Settings specific to REST datasets: row history (revisions), per-row TTL (auto-deletion after N days), history TTL, and whether to track the user who last updated each row.'
      })
    }

    if (d.isVirtual) {
      structureTabs.push({
        key: 'virtual',
        title: t('virtual'),
        icon: mdiPictureInPictureBottomRightOutline,
        color: virtualHasDiff.value ? 'accent' : undefined,
        agentDesc: 'Configuration of a virtual dataset: pick child datasets, choose which of their columns to expose, and define row-level filters (in/nin) that restrict the visible rows.'
      })
    }

    if (!d.draftReason && !d.isMetaOnly && accountRole.value === 'admin') {
      structureTabs.push({
        key: 'master-data',
        title: t('masterData'),
        icon: mdiStarFourPoints,
        color: !masterDataFormValid.value ? 'error' : (masterDataHasDiff.value ? 'accent' : undefined),
        appendIcon: !masterDataFormValid.value ? mdiAlertCircle : undefined,
        agentDesc: 'Expose this dataset as a master-data source (reusable as reference data via remote-service extensions on other datasets). Help button "Configure master data" → opens an agent that delegates the form filling to a VJSF subagent.'
      })
    }

    result.structure = { title: t('structure'), tabs: structureTabs, agentDesc: 'Structural definition of the dataset: column schema, calculated-column / remote-service extensions, and storage-mode configuration. Saving structural changes may trigger a reindex.' }
  }

  // Metadata section
  const metadataTabs: any[] = [
    { key: 'informations', title: t('informations'), icon: mdiInformation, color: metadataEditFetch.hasDiff.value ? 'accent' : undefined, agentDesc: 'Edit form for descriptive metadata: title, summary, description (markdown), license, origin, image, topics, keywords, creator, frequency, spatial/temporal coverage, modification date, related datasets, conformsTo schemas. Two in-form help buttons: next to the summary → `dataset_summarizer` subagent (generates a ≤300 char summary from sample data); next to the description → `dataset_description_writer` subagent (generates 500-2000 char markdown).' }
  ]
  if (!d.draftReason) {
    metadataTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment, color: undefined, agentDesc: 'Upload/edit/delete file attachments for the dataset (PDF references, supporting docs, etc.). An attachment can optionally be set as the dataset thumbnail.' })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs, agentDesc: 'Descriptive metadata edition. Save / cancel buttons in the section header. When there are unsaved changes a **Summarize changes** button also appears in the header → `dataset_changes_summarizer` subagent (produces a <500 char plain-text summary of the diff).' }

  // Exploration section (direct component tabs)
  if (d.finalizedAt && !d.isMetaOnly) {
    const explorationTabs: any[] = [
      { key: 'table', title: t('table'), icon: mdiTable, agentDesc: 'Paginated table of the rows with toolbar: free-text search (`q`), faceted filters, column selector, download menu (CSV/XLSX/Parquet/…), display-mode switch. Two help buttons: **Filter help** → `dataset_data` subagent (then `navigate` applies the filterQuery as URL query params); **Check quality** → `data_quality_checker` subagent (6-step audit: completeness, uniqueness, outliers, format consistency, distribution anomalies).' }
    ]
    if (d.bbox) {
      explorationTabs.push({ key: 'map', title: t('map'), icon: mdiMap, agentDesc: 'Interactive map of geolocalized rows. Accepts the same filter query params as the table tab (including `_c_bbox` and `_c_geo_distance`).' })
    }
    if (digitalDocumentField.value) {
      explorationTabs.push({ key: 'files', title: t('files'), icon: mdiContentCopy, agentDesc: 'Browse the digital-document files attached to rows (when the schema has a documentURI / file field).' })
    }
    if (imageField.value) {
      explorationTabs.push({ key: 'thumbnails', title: t('thumbnails'), icon: mdiImage, agentDesc: 'Thumbnail grid of the row images (when the schema has an image field).' })
    }
    if (d.rest?.history) {
      explorationTabs.push({ key: 'revisions', title: t('revisions'), icon: mdiHistory, agentDesc: 'Per-row revision history. Visible only for REST datasets that have history enabled in the Structure → REST config tab.' })
    }
    if (!d.draftReason || d.draftReason.key === 'file-updated') {
      explorationTabs.push({ key: 'applications', title: t('applications'), icon: mdiImageMultiple, agentDesc: 'Visualization applications already configured on top of this dataset, with a "+" button to create a new one.' })
    }
    if (explorationTabs.length) {
      result.exploration = { title: t('exploration'), tabs: explorationTabs, agentDesc: 'Browse and explore the dataset content.' }
    }
  }

  // Share section
  if (!d.draftReason || d.draftReason.key === 'file-updated') {
    const shareTabs: any[] = []
    if (can('getPermissions').value) {
      shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity, agentDesc: 'Grant read / write / admin permissions to specific users, organisations, departments or partners, or open access to "anyone".' })
    }
    if (can('setReadApiKey').value) {
      shareTabs.push({ key: 'readApiKey', title: t('readApiKey'), icon: mdiKey, agentDesc: 'Generate and manage a read-only API key — for embedding or programmatic access without a user session.' })
    }
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation, agentDesc: 'Publish or unpublish this dataset on the organisation\'s data portals (open or limited audience).' })
    if ($uiConfig.catalogsIntegration && accountRole.value === 'admin') {
      shareTabs.push({ key: 'catalog-publications', title: t('catalogPublications'), icon: mdiTransitConnection, agentDesc: 'Publish this dataset to external catalogs (data.gouv.fr, CKAN, etc.). Rendered as a d-frame from the catalogs service — admin-only.' })
    }
    if (d.finalizedAt) {
      shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags, agentDesc: 'Ready-to-copy iframe snippets and JS embed code to integrate this dataset\'s table / map into external pages.' })
    }
    if (shareTabs.length) {
      result.share = { title: t('share'), tabs: shareTabs, agentDesc: 'Access control and publication settings for this dataset.' }
    }
  }

  // Activity section
  const activityTabs: any[] = []
  if (can('readJournal').value && !d.isMetaOnly) {
    activityTabs.push({ key: 'journal', title: t('journal'), icon: mdiCalendarText, agentDesc: 'Chronological processing journal: ingestion, indexing, extension execution, errors. The natural first place to look when investigating why a dataset is stuck or in error state.' })
  }
  if ($uiConfig.eventsIntegration) {
    if (can('readJournal').value) {
      activityTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock, agentDesc: 'Audit trail of user actions on this dataset (who did what, when).' })
    }
    activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell, agentDesc: 'Subscribe the current user to in-app / email notifications for events on this dataset (errors, publication, etc.).' })
    if (can('setPermissions').value) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook, agentDesc: 'Configure outbound HTTP webhooks fired on dataset events.' })
    }
    result.activity = { title: t('tracking'), tabs: activityTabs, agentDesc: 'Logs, audit trail, notifications and webhooks for this dataset.' }
  }

  // Diagnose section (superadmin only)
  if (adminMode.value) {
    result.diagnose = {
      title: t('diagnose'),
      subtitle: t('diagnoseSubtitle'),
      tabs: [
        { key: 'elasticsearch', title: t('diagnoseTabEs'), icon: mdiDatabaseSearch },
        { key: 'locks', title: t('diagnoseTabLocks'), icon: mdiLock },
        { key: 'rawJson', title: t('diagnoseTabRaw'), icon: mdiCodeJson }
      ],
      agentDesc: 'Superadmin-only diagnostics: Elasticsearch index state, internal locks held on the dataset, and the raw JSON document as stored in MongoDB. Use to investigate stuck or corrupt datasets.'
    }
  }

  // Danger zone section
  if (can('changeOwner').value || can('writePartOf').value || canDeleteAllLines.value || can('delete').value) {
    result.dangerZone = { title: t('dangerZone'), tabs: [], agentDesc: 'Irreversible or sensitive operations: change owner, define/remove this dataset as a child of a parent resource (partOf), delete all lines (REST), delete the entire dataset. Always let the user perform these themselves — never trigger them programmatically.' }
  }

  return result
})

const tocSections = computed(() => {
  return Object.entries(sections.value).map(([id, s]) => ({
    id: id === 'dangerZone' ? 'danger-zone' : id,
    title: s.title
  }))
})

useAgentDatasetPageGuidance(locale, sections)
</script>
