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
      <v-card :title="t('upgradeTitle')">
        <v-card-text>
          {{ t('upgradeConfirm', { version: upgradeAvailable?.version }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            @click="showUpgradeDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="upgrading"
            @click="confirmUpgrade"
          >
            {{ t('upgrade') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Informations section -->
    <df-section-tabs
      v-if="sections.informations"
      id="informations"
      :title="sections.informations.title"
      :subtitle="sections.informations.subtitle"
      :svg="informationsSvg"
    >
      <template #windows>
        <application-metadata-details class="mb-4" />
      </template>
    </df-section-tabs>

    <!-- Metadata section -->
    <df-section-tabs
      v-if="sections.metadata"
      id="metadata"
      v-model="metadataTab"
      :title="sections.metadata.title"
      :tabs="sections.metadata.tabs"
      :svg="checklistSvg"
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
      </template>

      <template #windows>
        <v-tabs-window-item value="info">
          <application-metadata-form
            v-if="metadataEditFetch.data.value"
            v-model="metadataEditFetch.data.value"
            :server-data="metadataEditFetch.serverData.value"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="attachments">
          <application-metadata-attachments />
        </v-tabs-window-item>

        <v-tabs-window-item
          v-if="datasets.length"
          value="datasets"
        >
          <v-row>
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
        </v-tabs-window-item>

        <v-tabs-window-item
          v-if="childrenApps.length"
          value="children-apps"
        >
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
        </v-tabs-window-item>
      </template>
    </df-section-tabs>

    <!-- Render section (new) -->
    <df-section-tabs
      v-if="sections.render"
      id="render"
      v-model="renderTab"
      :min-height="400"
      :title="sections.render.title"
      :tabs="sections.render.tabs"
      :svg="creativeSvg"
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
                :src="`${applicationLink}?d-frame=true&primary=${theme.current.value.colors.primary}`"
                resize="no"
                aspect-ratio
                sync-params
              />
            </v-card>
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
            <permissions-editor
              v-if="application"
              :model-value="permissions"
              :resource="application"
              resource-type="applications"
              :disabled="!can('setPermissions')"
              :has-private-parents="hasPrivateParents"
              @save="onSavePermissions"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="protected-links">
            <application-protected-links />
          </v-tabs-window-item>

          <v-tabs-window-item value="publication-sites">
            <application-publication-sites />
          </v-tabs-window-item>

          <v-tabs-window-item value="integration">
            <embed-integration
              resource-type="applications"
              :resource="application"
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
        <v-list class="py-0">
          <v-list-item
            v-if="can('delete')"
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

          <v-divider v-if="can('delete') || can('writePartOf')" />

          <v-list-item
            v-if="can('writePartOf')"
            :prepend-icon="mdiFamilyTree"
            class="py-4"
          >
            <div class="text-body-1 font-weight-bold">
              {{ t('partOf') }}
            </div>
            <div class="text-body-medium text-medium-emphasis">
              <i18n-t
                v-if="application?.partOf"
                keypath="partOfCurrentDesc"
                tag="span"
              >
                <template #title>
                  <router-link :to="`/application/${application.partOf.id}`">
                    {{ application.partOf.title }}
                  </router-link>
                </template>
              </i18n-t>
              <template v-else>
                {{ t('partOfDesc') }}
              </template>
            </div>
            <template #append>
              <part-of-dialog
                v-if="application"
                v-model="showPartOfDialog"
                resource-type="applications"
                :resource="application"
                :candidates="partOfCandidates"
                :candidates-loading="partOfCandidatesLoading"
                @changed="store.applicationFetch.refresh()"
              >
                <template #activator="{ props: activatorProps }">
                  <v-btn
                    v-bind="activatorProps"
                    variant="outlined"
                    color="error"
                    class="ml-4 align-self-center"
                    @click="openPartOfDialog"
                  >
                    {{ application?.partOf ? t('partOfUnset') : t('partOfDefine') }}
                  </v-btn>
                </template>
              </part-of-dialog>
            </template>
          </v-list-item>

          <v-divider v-if="can('writePartOf') && can('delete')" />

          <v-list-item
            v-if="can('delete')"
            :prepend-icon="mdiDelete"
            class="py-4"
          >
            <div class="text-body-1 font-weight-bold">
              {{ t('deleteApp') }}
            </div>
            <div class="text-body-medium text-medium-emphasis">
              {{ t('deleteAppDesc') }}
            </div>
            <template #append>
              <v-btn
                variant="outlined"
                color="error"
                class="ml-4 align-self-center"
                @click="openDeleteDialog"
              >
                {{ t('deleteApp') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </df-section-tabs>

    <owner-change-dialog
      v-if="can('delete')"
      v-model="showOwnerDialog"
      :resource="application"
      resource-type="applications"
      @changed="store.applicationFetch.refresh()"
    />

    <children-action-dialog
      v-model="showDeleteDialog"
      :title="t('deleteApp')"
      :message="t('deleteMsg', { title: application?.title })"
      :warning="childrenCount > 0 ? t('childrenWarning', childrenCount) : undefined"
      kind="resources"
      :loading="confirmRemove.loading.value"
      @confirm="action => confirmRemove.execute(action)"
    />

    <df-navigation-right>
      <application-actions />
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  informationsSubtitle: Retrouvez les informations générales et techniques de l'application.
  metadata: Métadonnées
  info: Informations
  attachments: Pièces jointes
  datasets: Jeux de données utilisés
  childrenApps: Applications utilisées
  render: Rendu
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
  upgradeAvailable: "Version {version} disponible"
  upgradeAction: Mettre à jour
  upgradeTitle: Mise à jour de version
  upgradeConfirm: "Voulez-vous mettre à jour l'application vers la version {version} ? L'application sera reconfigurée avec la nouvelle version."
  details: Détails
  save: Enregistrer
  saved: Les modifications ont été enregistrées
  permissionsUpdated: Les permissions ont été mises à jour
  confirmCancelText: Souhaitez-vous annuler vos modifications ?
  cancel: Annuler
  upgrade: Mettre à jour
  dangerZone: Zone de danger
  changeOwner: Changer le propriétaire
  changeOwnerDesc: Transférer cette application à un autre propriétaire.
  partOf: Ressource parente
  partOfDefine: Définir comme enfant
  partOfUnset: Retirer l'attribut enfant
  partOfDesc: Définir cette application comme n'existant que pour servir une application parente (par exemple un tableau de bord).
  partOfCurrentDesc: "Cette application est actuellement définie comme enfant de : {title}"
  deleteApp: Supprimer l'application
  deleteAppSuccess: L'application a bien été supprimée.
  deleteAppDesc: La suppression est définitive et la configuration ne pourra pas être récupérée.
  deleteMsg: Voulez-vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérée.
  childrenWarning: aucune ressource enfant | Cette application a une ressource enfant qui n'existe que dans ce cadre. | Cette application a {count} ressources enfants qui n'existent que dans ce cadre.
  yes: Oui
  no: Non
en:
  applications: Applications
  informationsSubtitle: Find the general and technical information for this application.
  metadata: Metadata
  info: Information
  attachments: Attachments
  datasets: Used datasets
  childrenApps: Used applications
  render: Render
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
  upgradeAvailable: "Version {version} available"
  upgradeAction: Upgrade
  upgradeTitle: Version upgrade
  upgradeConfirm: "Do you want to upgrade the application to version {version}? The application will be reconfigured with the new version."
  details: Details
  save: Save
  saved: Changes were saved
  permissionsUpdated: Permissions were updated
  confirmCancelText: Do you want to discard your changes?
  cancel: Cancel
  upgrade: Upgrade
  dangerZone: Danger Zone
  changeOwner: Change owner
  changeOwnerDesc: Transfer this application to another owner.
  partOf: Parent resource
  partOfDefine: Define as child
  partOfUnset: Remove the child attribute
  partOfDesc: Define this application as existing only to serve a parent application (e.g. a dashboard).
  partOfCurrentDesc: "This application is currently defined as a child of: {title}"
  deleteApp: Delete application
  deleteAppSuccess: Application was deleted successfully.
  deleteAppDesc: Deletion is permanent and configuration cannot be recovered.
  deleteMsg: Do you really want to delete the application "{title}"? Deletion is permanent and the application configuration cannot be recovered.
  childrenWarning: no child resource | This application has a child resource that only exists within this context. | This application has {count} child resources that only exist within this context.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { useTheme } from 'vuetify'
import { mdiAccountSwitch, mdiBell, mdiCancel, mdiClipboardTextClock, mdiCloudKey, mdiCodeTags, mdiDatabase, mdiDelete, mdiFamilyTree, mdiImageMultiple, mdiInformation, mdiPaperclip, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import informationsSvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import creativeSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { useAgentApplicationMetadataTools } from '~/composables/application/agent-metadata-tools'
import { useAgentApplicationPageGuidance } from '~/composables/application/agent-page-guidance-tools'
import { $uiConfig, $apiPath } from '~/context'

const { t, locale } = useI18n()
const route = useRoute<'/application/[id]/'>()
const router = useRouter()
const theme = useTheme()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('info')
const renderTab = ref('config')
const activityTab = ref('traceability')

const store = useApplicationStore()
const { application, applicationLink, can, patch, remove, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch, parentAppsFetch, permissions, permissionsFetch, savePermissions } = store

const { sendUiNotif } = useUiNotif()

const onSavePermissions = async (newPermissions: import('#api/types').Permission[]) => {
  await savePermissions(newPermissions)
  sendUiNotif({ type: 'success', msg: t('permissionsUpdated') })
}
const { availableVersions } = useApplicationVersions(store)

useApplicationWatch(['draft-error'], store)

const metadataEditFetch = useEditFetch<any>(`${$apiPath}/applications/${route.params.id}`, {
  patch: true,
  fetchAfterSave: true,
  saveOptions: {
    success: t('saved')
  }
})

watch(metadataEditFetch.serverData, (d) => {
  if (d) application.value = d as any
})

// Sync store.application.image back to metadataEditFetch when changed externally (e.g. thumbnail set from attachments tab)
watch(() => application.value?.image, (newImage) => {
  if (metadataEditFetch.serverData.value && metadataEditFetch.serverData.value.image !== newImage) {
    const wasUnchanged = metadataEditFetch.data.value?.image === metadataEditFetch.serverData.value.image
    metadataEditFetch.serverData.value.image = newImage
    if (wasUnchanged && metadataEditFetch.data.value) {
      metadataEditFetch.data.value.image = newImage
    }
  }
})

useLeaveGuard(metadataEditFetch.hasDiff, { locale })

// Agent tools for metadata editing
useAgentApplicationMetadataTools(
  locale,
  (s) => { if (metadataEditFetch.data.value) metadataEditFetch.data.value.summary = s },
  (d) => { if (metadataEditFetch.data.value) metadataEditFetch.data.value.description = d }
)

const cancelMetadata = () => {
  metadataEditFetch.data.value = JSON.parse(JSON.stringify(metadataEditFetch.serverData.value))
}

const showUpgradeDialog = ref(false)
const showOwnerDialog = ref(false)
const showDeleteDialog = ref(false)
const upgrading = ref(false)

const showPartOfDialog = ref(false)
const partOfCandidates = computed(() => (parentAppsFetch.data.value?.results ?? []).map(a => ({ type: 'application' as const, id: a.id, title: a.title })))
const partOfCandidatesLoading = computed(() => parentAppsFetch.loading.value)
const openPartOfDialog = () => {
  parentAppsFetch.refresh()
}

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
  if (can('getPermissions') && !permissionsFetch.initialized.value) permissionsFetch.refresh()
}, { immediate: true })

// Fetch datasets and children apps once config is loaded
watch(() => store.config.value, (conf) => {
  if (!conf) return
  if (!datasetsFetch.initialized.value) datasetsFetch.refresh()
  if (!childrenAppsFetch.initialized.value) childrenAppsFetch.refresh()
}, { immediate: true })

const datasets = computed(() => datasetsFetch.data.value?.results ?? [])
const childrenApps = computed(() => childrenAppsFetch.data.value?.results ?? [])

const hasPrivateParents = computed(() =>
  datasets.value.some(d => d.visibility === 'private' || d.visibility === 'protected')
)

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
    await router.push(`/application/${route.params.id}/config`)
  } finally {
    upgrading.value = false
  }
}

const childrenCount = ref(0)
const openDeleteDialog = async () => {
  showDeleteDialog.value = true
  const [childDatasets, childApps] = await Promise.all([
    $fetch<{ count: number }>('datasets', { query: { partOf: route.params.id, size: 0 } }),
    $fetch<{ count: number }>('applications', { query: { partOf: route.params.id, size: 0 } })
  ])
  childrenCount.value = childDatasets.count + childApps.count
}

const confirmRemove = useAsyncAction(async (childrenAction?: 'delete' | 'unflag') => {
  await remove(childrenAction)
  await router.push('/applications')
}, { success: t('deleteAppSuccess') })

const sections = computedDeepDiff(() => {
  if (!application.value) return {} as Record<string, { title: string, subtitle?: string, tabs?: any[], agentDesc?: string }>

  const result: Record<string, { title: string, subtitle?: string, tabs?: any[], agentDesc?: string }> = {}

  // Informations section
  result.informations = {
    title: t('info'),
    subtitle: t('informationsSubtitle'),
    agentDesc: 'Read-only overview of the application: owner, application model (base app) and version, key dates. No edit controls here — descriptive metadata is edited in the Metadata section below.'
  }

  // Metadata section
  const metadataTabs = [
    { key: 'info', title: t('info'), icon: mdiInformation, color: metadataEditFetch.hasDiff.value ? 'accent' : undefined, agentDesc: 'Edit form for descriptive metadata: title, summary, description (markdown), topics, thumbnail image. Two in-form help buttons: next to the summary → application_summarizer subagent (≤300 char summary); next to the description → application_description_writer subagent (500-2000 char markdown).' },
    { key: 'attachments', title: t('attachments'), icon: mdiPaperclip, agentDesc: 'Upload/edit/delete file attachments for the application; an attachment can be set as the thumbnail.' }
  ]
  if (datasets.value.length) {
    metadataTabs.push({ key: 'datasets', title: t('datasets'), icon: mdiDatabase, agentDesc: 'The datasets used by this application (read-only cards).' })
  }
  if (childrenApps.value.length) {
    metadataTabs.push({ key: 'children-apps', title: t('childrenApps'), icon: mdiImageMultiple, agentDesc: 'Other applications used by this application (read-only cards).' })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs, agentDesc: 'Descriptive metadata edition. Save / cancel buttons appear in the section header when there are unsaved changes.' }

  // Render section
  result.render = {
    title: t('render'),
    tabs: [{ key: 'config', title: t('config'), icon: mdiSquareEditOutline, agentDesc: 'Live preview of the application with an "Edit configuration" button leading to the full-screen config editor (where the appConfig_form subagent assists). Use get_application_config to read the current validated configuration.' }],
    agentDesc: 'Rendered application and entry point to its configuration.'
  }

  const shareTabs = []
  if (can('getPermissions')) {
    shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity, agentDesc: 'Grant read / admin permissions to users, organisations, departments or partners, or open access to "anyone".' })
  }
  if (can('getKeys')) {
    shareTabs.push({ key: 'protected-links', title: t('protectedLink'), icon: mdiCloudKey, agentDesc: 'Manage protected links — unconnected access to the application via signed URLs.' })
  }
  if (!$uiConfig.disablePublicationSites) {
    shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation, agentDesc: 'Publish or unpublish this application on the organisation\'s data portals.' })
  }
  shareTabs.push({ key: 'integration', title: t('integration'), icon: mdiCodeTags, agentDesc: 'Ready-to-copy iframe / embed snippets to integrate this application into external pages.' })
  if (shareTabs.length) {
    result.share = { title: t('share'), tabs: shareTabs, agentDesc: 'Access control and publication settings for this application.' }
  }

  if ($uiConfig.eventsIntegration) {
    const activityTabs = []
    if (can('readJournal')) {
      activityTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock, agentDesc: 'Audit trail of user actions on this application (who did what, when).' })
    }
    activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell, agentDesc: 'Subscribe to in-app / email notifications for events on this application.' })
    if (can('setPermissions')) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook, agentDesc: 'Configure webhooks fired on events for this application.' })
    }
    result.activity = { title: t('tracking'), tabs: activityTabs, agentDesc: 'Activity tracking for this application.' }
  }

  if (can('delete') || can('writePartOf')) {
    result.dangerZone = { title: t('dangerZone'), tabs: [], agentDesc: 'Destructive or sensitive operations: change owner, define/remove this application as a child of a parent application (partOf), delete the application.' }
  }

  return result
})

const tocSections = computed(() => {
  return Object.entries(sections.value).map(([id, s]) => ({
    id: id === 'dangerZone' ? 'danger-zone' : id,
    title: s.title
  }))
})

useAgentApplicationPageGuidance(locale, sections)
</script>
