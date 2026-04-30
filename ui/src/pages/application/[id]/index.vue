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

          <v-divider v-if="can('delete')" />

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
      v-if="can('delete')"
      v-model="showOwnerDialog"
      :resource="application"
      resource-type="applications"
      @changed="store.applicationFetch.refresh()"
    />

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card :title="t('deleteApp')">
        <v-card-text>{{ t('deleteMsg', { title: application?.title }) }}</v-card-text>
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

    <df-navigation-right>
      <application-actions />
      <df-toc :sections="tocSections" />
      <v-list-item
        v-if="baseAppFetch.data.value?.documentation"
        :href="baseAppFetch.data.value.documentation"
        target="_blank"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiBookOpenVariant"
          />
        </template>
        {{ t('documentation') }}
      </v-list-item>
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
  deleteApp: Supprimer l'application
  deleteAppDesc: La suppression est définitive et la configuration ne pourra pas être récupérée.
  deleteMsg: Voulez-vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérée.
  yes: Oui
  documentation: Documentation
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
  deleteApp: Delete application
  deleteAppDesc: Deletion is permanent and configuration cannot be recovered.
  deleteMsg: Do you really want to delete the application "{title}"? Deletion is permanent and the application configuration cannot be recovered.
  yes: Yes
  documentation: Documentation
  no: No
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { useTheme } from 'vuetify'
import { mdiAccountSwitch, mdiBell, mdiBookOpenVariant, mdiCancel, mdiClipboardTextClock, mdiCloudKey, mdiCodeTags, mdiDatabase, mdiDelete, mdiImageMultiple, mdiInformation, mdiPaperclip, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import informationsSvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import creativeSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
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
const { application, applicationLink, can, patch, remove, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch, permissions, permissionsFetch, savePermissions } = store

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

const cancelMetadata = () => {
  metadataEditFetch.data.value = JSON.parse(JSON.stringify(metadataEditFetch.serverData.value))
}

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

const sections = computedDeepDiff(() => {
  if (!application.value) return {} as Record<string, { title: string, subtitle?: string, tabs?: any[] }>

  const result: Record<string, { title: string, subtitle?: string, tabs?: any[] }> = {}

  // Informations section
  result.informations = {
    title: t('info'),
    subtitle: t('informationsSubtitle')
  }

  // Metadata section
  const metadataTabs = [
    { key: 'info', title: t('info'), icon: mdiInformation, color: metadataEditFetch.hasDiff.value ? 'accent' : undefined },
    { key: 'attachments', title: t('attachments'), icon: mdiPaperclip }
  ]
  if (datasets.value.length) {
    metadataTabs.push({ key: 'datasets', title: t('datasets'), icon: mdiDatabase })
  }
  if (childrenApps.value.length) {
    metadataTabs.push({ key: 'children-apps', title: t('childrenApps'), icon: mdiImageMultiple })
  }
  result.metadata = { title: t('metadata'), tabs: metadataTabs }

  // Render section
  result.render = {
    title: t('render'),
    tabs: [{ key: 'config', title: t('config'), icon: mdiSquareEditOutline }]
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
    const activityTabs = []
    if (can('readJournal')) {
      activityTabs.push({ key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock })
    }
    activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions')) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.activity = { title: t('tracking'), tabs: activityTabs }
  }

  if (can('delete')) {
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
