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
          <v-tabs-window-item value="info">
            <!-- Infos éditables inline -->
            <v-text-field
              v-model="application.title"
              :disabled="!can('writeDescription')"
              label="Titre"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-3"
              @change="patch({title: application.title})"
            />
            <v-textarea
              v-model="application.summary"
              :disabled="!can('writeDescription')"
              label="Résumé"
              rows="3"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-3"
              @change="patch({summary: application.summary})"
            />
            <v-text-field
              v-model="application.description"
              :disabled="!can('writeDescription')"
              label="Description"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-3"
              @change="patch({description: application.description})"
            />

            <!-- Topics -->
            <v-autocomplete
              v-if="topicsFetch.data.value?.length"
              v-model="application.topics"
              :disabled="!can('writeDescription')"
              :items="topicsFetch.data.value ?? []"
              item-title="title"
              item-value="id"
              :label="t('topics')"
              multiple
              return-object
              chips
              class="mb-3"
              @update:model-value="patch({topics: application.topics})"
            />

            <!-- Image -->
            <v-text-field
              v-model="application.image"
              :disabled="!can('writeDescription')"
              label="Image"
              hide-details
              class="mb-3"
              clearable
              @change="patch({image: application.image})"
            />

            <!-- Détails (read-only) -->
            <v-card class="mt-6">
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
                  :prepend-icon="mdiSquareEditOutline"
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
        </v-tabs-window>
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
        <v-tabs-window :model-value="tab">
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
            <embed-integration
              resource-type="applications"
              :resource="application"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </template>
    </df-section-tabs>

    <!-- Events section -->
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
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  metadata: Métadonnées
  info: Informations
  attachments: Pièces jointes
  datasets: Jeux de données utilisés
  childrenApps: Applications utilisées
  render: Rendu
  config: Configuration
  editConfig: Éditer la configuration
  baseApp: Application de base
  owner: Propriétaire
  metadataUpdated: Métadonnées mises à jour
  created: Création
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
  topics: Thématiques
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
  metadata: Metadata
  info: Information
  attachments: Attachments
  datasets: Used datasets
  childrenApps: Used applications
  render: Render
  config: Configuration
  editConfig: Edit configuration
  baseApp: Base application
  owner: Owner
  metadataUpdated: Metadata updated
  created: Created
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
  topics: Topics
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
import { mdiAccount, mdiBell, mdiClipboardTextClock, mdiCloudKey, mdiCodeTags, mdiDatabase, mdiImageMultiple, mdiInformation, mdiPaperclip, mdiPencil, mdiPlusCircleOutline, mdiPresentation, mdiSecurity, mdiSquareEditOutline, mdiWebhook } from '@mdi/js'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import creativeSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import { provideApplicationStore } from '~/composables/application/store'
import { useApplicationVersions } from '~/composables/application/versions'
import { useApplicationWatch } from '~/composables/application/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { $uiConfig, $apiPath } from '~/context'

const { t, locale } = useI18n()
const route = useRoute<'/application/[id]/'>()
const router = useRouter()

const breadcrumbs = useBreadcrumbs()
const metadataTab = ref('info')
const renderTab = ref('config')
const activityTab = ref('traceability')

const store = provideApplicationStore(route.params.id)
const { application, applicationLink, can, patch, remove, configFetch, datasetsFetch, childrenAppsFetch, baseAppFetch } = store
const { availableVersions } = useApplicationVersions(store)

useApplicationWatch(['draft-error'], store)

const topicsFetch = useFetch<any[]>(() => application.value?.owner ? `${$apiPath}/settings/${application.value.owner.type}/${application.value.owner.id}/topics` : null)

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

  const result: Record<string, { title: string, tabs: any[] }> = {}

  // Metadata section
  const metadataTabs = [
    { key: 'info', title: t('info'), icon: mdiInformation },
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
    const activityTabs = [
      { key: 'traceability', title: t('traceability'), icon: mdiClipboardTextClock }
    ]
    activityTabs.push({ key: 'notifications', title: t('notifications'), icon: mdiBell })
    if (can('setPermissions')) {
      activityTabs.push({ key: 'webhooks', title: t('webhooks'), icon: mdiWebhook })
    }
    result.activity = { title: t('tracking'), tabs: activityTabs }
  }

  if (can('setOwner') || can('delete')) {
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
