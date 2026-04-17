<template>
  <v-container
    class="pa-0"
    fluid
  >
    <v-stepper
      v-model="currentStep"
      class="bg-background"
      flat
    >
      <v-stepper-header class="bg-surface">
        <v-stepper-item
          :value="1"
          :complete="!!publicationSite"
          :color="currentStep === 1 ? 'primary' : ''"
          :icon="mdiPublish"
          :title="t('stepPortal')"
          :subtitle="publicationSite ? truncate(publicationSite.title || publicationSite.url || publicationSite.id, 30) : undefined"
          editable
        />
        <v-divider />
        <v-stepper-item
          :value="2"
          :complete="!!datasetServer"
          :color="currentStep === 2 ? 'primary' : ''"
          :icon="mdiDatabase"
          :title="t('stepDataset')"
          :subtitle="datasetServer ? truncate(datasetServer.title, 30) : undefined"
          :editable="!!publicationSite"
        />
        <v-divider />
        <v-stepper-item
          :value="3"
          :color="hasPermissionsDiff ? 'accent' : (currentStep === 3 ? 'primary' : '')"
          :icon="mdiLock"
          :title="t('stepPermissions')"
          :editable="!!datasetServer && !alreadyPublished"
        />
        <v-divider />
        <v-stepper-item
          :value="4"
          :complete="metadataValid"
          :color="hasMetadataDiff ? 'accent' : (currentStep === 4 ? 'primary' : '')"
          :icon="mdiFileDocument"
          :title="t('stepMetadata')"
          :editable="!!publicationSite && !!datasetServer"
        />
        <v-divider />
        <v-stepper-item
          :value="5"
          :color="currentStep === 5 ? 'primary' : ''"
          :icon="mdiCheckAll"
          :title="t('stepAction')"
          :editable="metadataValid"
        />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Step 1: Portal selection -->
        <v-stepper-window-item :value="1">
          <v-alert
            v-if="publicationSitesFetch.data.value && !publicationSites.length"
            type="warning"
            variant="outlined"
            max-width="500"
          >
            {{ t('noPublicationSite') }}
          </v-alert>
          <template v-if="publicationSites.length">
            <p class="text-body-large mb-2">
              {{ t('selectPortal') }}
            </p>
            <v-card
              variant="outlined"
              max-width="500"
            >
              <v-list>
                <!-- TODO: site.departmentName doesn't exist in current API, need to be added if we want to show department name in the list -->
                <v-list-item
                  v-for="(site, i) in publicationSites"
                  :key="i"
                  :title="site.title || site.url || site.id"
                  :subtitle="site.departmentName || site.department"
                  :active="!!(publicationSite && site.type === publicationSite.type && site.id === publicationSite.id)"
                  color="primary"
                  @click="selectSite(site)"
                />
              </v-list>
            </v-card>
          </template>
        </v-stepper-window-item>

        <!-- Step 2: Dataset selection -->
        <v-stepper-window-item :value="2">
          <dataset-select
            v-model="selectedDataset"
            :owner="datasetOwnerFilter"
            class="mt-2"
            @update:model-value="onDatasetSelected"
          />

          <v-alert
            v-if="alreadyPublished"
            type="warning"
            variant="outlined"
            density="compact"
            class="mt-4"
            max-width="600"
          >
            {{ t('alreadyPublished') }}
          </v-alert>
        </v-stepper-window-item>

        <!-- Step 3: Permissions -->
        <v-stepper-window-item :value="3">
          <permissions-editor
            v-if="datasetEdit"
            :model-value="permissionsEdit"
            :server-data="permissionsServer"
            :resource="(datasetEdit as any)"
            resource-type="datasets"
            :disabled="!datasetEdit.userPermissions?.includes('setPermissions')"
            simple
            @save="onUpdatePermissions"
          />
        </v-stepper-window-item>

        <!-- Step 4: Metadata -->
        <v-stepper-window-item :value="4">
          <v-form
            v-if="datasetEdit && publicationSite"
            v-model="metadataFormValid"
          >
            <dataset-metadata-form
              v-model="datasetEdit"
              :server-data="datasetServer"
              :required="requiredMetadata"
              class="mt-2"
            />
          </v-form>
        </v-stepper-window-item>

        <!-- Step 5: Action / Confirmation -->
        <v-stepper-window-item :value="5" />
      </v-stepper-window>

      <v-stepper-actions
        v-if="currentStep > 1"
        :prev-text="t('back')"
        class="justify-start ga-2"
        @click:prev="goToPrev"
      >
        <template #next>
          <div class="d-flex align-center ga-3">
            <confirm-menu
              v-if="canCancelCurrentTab"
              :btn-props="{ color: 'warning', variant: 'tonal' }"
              :label="t('cancel')"
              :title="cancelTitle"
              :text="t('confirmCancelText')"
              :icon="mdiCancel"
              yes-color="warning"
              @confirm="cancelCurrentTab"
            />
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!isNextEnabled"
              :loading="doPublish.loading.value"
              @click="goToNext"
            >
              {{ nextButtonText }}
            </v-btn>
            <span
              v-if="hasPendingChanges && (currentStep === 3 || currentStep === 4)"
              class="text-caption text-warning"
            >
              {{ t('pendingChanges') }}
            </span>
          </div>
        </template>
      </v-stepper-actions>
    </v-stepper>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  shareDataset: Publier un jeu de données
  selectPortal: "Choisissez un portail :"
  stepDataset: Jeu de données
  stepPortal: Portail
  stepPermissions: Permissions
  stepMetadata: Métadonnées
  stepAction: Confirmation
  continue: Continuer
  publish: Publier le jeu de données
  requestPublication: Demander la publication de ce jeu de données à un administrateur
  publicationRequested: La publication sera soumise à un administrateur pour validation.
  alreadyPublished: Ce jeu de données est déjà publié sur ce portail.
  noPublicationSite: Aucun portail n'est configuré sur ce compte.
  pendingChanges: Les modifications seront enregistrées à la publication
  cancel: Annuler
  cancelPermissionsTitle: Annulation des modifications des permissions
  cancelMetadataTitle: Annulation des modifications des métadonnées
  confirmCancelText: Souhaitez-vous annuler vos modifications ?
  back: Retour
en:
  datasets: Datasets
  shareDataset: Share a dataset
  selectPortal: "Select a portal:"
  stepDataset: Dataset
  stepPortal: Portal
  stepPermissions: Permissions
  stepMetadata: Metadata
  stepAction: Confirmation
  continue: Continue
  publish: Publish the dataset
  requestPublication: Submit the publication of this dataset to an admin for approval
  publicationRequested: The publication will be submitted to an admin for validation.
  alreadyPublished: This dataset is already published on this portal.
  noPublicationSite: No portal is configured for this account.
  pendingChanges: Changes will be saved at publication
  cancel: Cancel
  cancelPermissionsTitle: Discard permissions changes
  cancelMetadataTitle: Discard metadata changes
  confirmCancelText: Do you want to discard your changes?
  back: Back
</i18n>

<script setup lang="ts">
import type { ListedDataset } from '~/components/dataset/select/utils'
import type { PublicationSite, Permission } from '#api/types'
import { mdiCancel, mdiCheckAll, mdiDatabase, mdiFileDocument, mdiLock, mdiPublish } from '@mdi/js'
import equal from 'fast-deep-equal'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import { $fetch, $apiPath } from '~/context'

// TODO: departmentName n'est pas peuplé par GET /settings/:type/:id/publication-sites,
// fallback sur l'ID en attendant la correction côté back.
type PublicationSiteWithDepName = PublicationSite & { departmentName?: string }

const { t, locale } = useI18n()
const { account } = useSessionAuthenticated()
const { canAdmin } = usePermissions()
const router = useRouter()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('datasets'), to: '/datasets' }, { text: t('shareDataset') }] })

const currentStep = ref(1)
const publicationSite = ref<PublicationSiteWithDepName | null>(null)
const selectedDataset = ref<ListedDataset | undefined>()
// Pristine server copy — used for diffing and as `:server-data` for the metadata form
const datasetServer = ref<Record<string, any> | null>(null)
// Mutable copy edited in place by `dataset-metadata-form`
const datasetEdit = ref<Record<string, any> | null>(null)
const permissionsServer = ref<Permission[] | null>(null)
const permissionsEdit = ref<Permission[] | null>(null)
const metadataFormValid = ref(false)

const hasMetadataDiff = computed(() =>
  !!datasetServer.value && !equal(datasetEdit.value, datasetServer.value))
const hasPermissionsDiff = computed(() =>
  !!permissionsServer.value && !equal(permissionsEdit.value, permissionsServer.value))
const hasPendingChanges = computed(() => hasMetadataDiff.value || hasPermissionsDiff.value)

useLeaveGuard(hasPendingChanges, { locale })

// Fetch publication sites for the account (including all departments for orgs without department)
const settingsPath = computed(() => {
  if (!account.value) return null
  let path = `${account.value.type}/${account.value.id}`
  if (account.value.type === 'organization' && !account.value.department) {
    path += ':*'
  }
  return path
})

const publicationSitesFetch = useFetch<PublicationSiteWithDepName[]>(
  () => settingsPath.value ? `${$apiPath}/settings/${settingsPath.value}/publication-sites` : null
)

const publicationSites = computed(() => publicationSitesFetch.data.value ?? [])

// Owner for dataset search, scoped by portal department
const datasetOwnerFilter = computed(() => {
  if (!account.value || !publicationSite.value) return null
  return {
    type: account.value.type,
    id: account.value.id,
    department: publicationSite.value.department || account.value.department
  }
})

// Fetch publication site settings to get required metadata fields
const settingsFetch = useFetch<any>(() => {
  if (!datasetServer.value || !publicationSite.value) return null
  const o = datasetServer.value.owner
  return `${$apiPath}/settings/${o.type}/${o.id}`
})

const requiredMetadata = computed(() => {
  return settingsFetch.data.value?.publicationSite?.settings?.datasetsRequiredMetadata ?? []
})

// Publication site key for comparing
const publicationSiteKey = computed(() => {
  if (!publicationSite.value) return null
  return `${publicationSite.value.type}:${publicationSite.value.id}`
})

// Check if dataset is already published on selected site
const alreadyPublished = computed(() => {
  return !!(publicationSiteKey.value && datasetServer.value?.publicationSites?.includes(publicationSiteKey.value))
})

// Can publish directly if admin or staging mode
const canPublishDirectly = computed(() => {
  if (!publicationSite.value) return false
  const staging = publicationSite.value.settings?.staging
  if (staging) return true
  if (!canAdmin.value) return false
  // If user has a department, it must match the publication site department
  if (account.value?.department && account.value.department !== publicationSite.value.department) return false
  return true
})

// Validate that all required metadata fields are filled
const metadataValid = computed(() => {
  // First check form validity
  if (!metadataFormValid.value) return false

  // Then check required metadata fields against the current in-progress edits
  if (!datasetEdit.value || !requiredMetadata.value.length) return true
  for (const field of requiredMetadata.value) {
    if (field.startsWith('custom.')) {
      const key = field.replace('custom.', '')
      if (!datasetEdit.value.customMetadata?.[key]) return false
    } else if (!datasetEdit.value[field]) return false
  }
  return true
})

function truncate (str: string | undefined, len: number): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

function resetDatasetState () {
  datasetServer.value = null
  datasetEdit.value = null
  permissionsServer.value = null
  permissionsEdit.value = null
}

function selectSite (site: PublicationSiteWithDepName) {
  publicationSite.value = site
  // Reset dataset selection when portal changes
  selectedDataset.value = undefined
  resetDatasetState()
  currentStep.value = 2
}

async function onDatasetSelected (selected: Record<string, any> | null | undefined) {
  if (!selected) {
    resetDatasetState()
    return
  }
  // Load full dataset
  try {
    const fetched = await $fetch<Record<string, any>>(`datasets/${selected.id}`)
    datasetServer.value = fetched
    datasetEdit.value = JSON.parse(JSON.stringify(fetched))
    let perms: Permission[] = []
    if (fetched.userPermissions?.includes('getPermissions')) {
      perms = await $fetch<Permission[]>(`datasets/${fetched.id}/permissions`)
    }
    permissionsServer.value = perms
    permissionsEdit.value = JSON.parse(JSON.stringify(perms))
    if (!alreadyPublished.value) {
      currentStep.value = 3
    }
  } catch {
    resetDatasetState()
  }
}

function onUpdatePermissions (newPermissions: Permission[]) {
  permissionsEdit.value = JSON.parse(JSON.stringify(newPermissions))
}

const canCancelCurrentTab = computed(() => {
  if (currentStep.value === 3) return hasPermissionsDiff.value
  if (currentStep.value === 4) return hasMetadataDiff.value
  return false
})

const cancelTitle = computed(() => {
  if (currentStep.value === 3) return t('cancelPermissionsTitle')
  if (currentStep.value === 4) return t('cancelMetadataTitle')
  return ''
})

function cancelCurrentTab () {
  if (currentStep.value === 3 && permissionsServer.value) {
    permissionsEdit.value = JSON.parse(JSON.stringify(permissionsServer.value))
  } else if (currentStep.value === 4 && datasetServer.value) {
    datasetEdit.value = JSON.parse(JSON.stringify(datasetServer.value))
  }
}

// Shallow diff between datasetEdit and datasetServer — keeps readonly server fields (owner,
// updatedAt, …) out of the PATCH body, which the API rejects as "additional properties".
function getDatasetPatch (): Record<string, any> {
  if (!datasetEdit.value || !datasetServer.value) return {}
  const patch: Record<string, any> = {}
  for (const key of Object.keys(datasetEdit.value)) {
    if (key === 'publicationSites' || key === 'requestedPublicationSites') continue
    if (!equal(datasetEdit.value[key], datasetServer.value[key])) {
      patch[key] = datasetEdit.value[key]
    }
  }
  return patch
}

async function flushPendingEdits () {
  if (!datasetServer.value) return
  const id = datasetServer.value.id
  const patch = getDatasetPatch()
  if (Object.keys(patch).length) {
    await $fetch(`datasets/${id}`, { method: 'PATCH', body: patch })
  }
  if (hasPermissionsDiff.value) {
    await $fetch(`datasets/${id}/permissions`, { method: 'PUT', body: permissionsEdit.value })
  }
}

function resetServerSnapshots (extraDatasetPatch: Record<string, any> = {}) {
  // Sync server snapshots with what was just saved so the leave guard does not fire on redirect.
  // Must also propagate extraDatasetPatch into datasetEdit, otherwise the next diff flags
  // publicationSites as changed (edit still holds the old value) and the leave guard misfires.
  if (datasetEdit.value) {
    Object.assign(datasetEdit.value, extraDatasetPatch)
    datasetServer.value = JSON.parse(JSON.stringify(datasetEdit.value))
  }
  permissionsServer.value = permissionsEdit.value ? JSON.parse(JSON.stringify(permissionsEdit.value)) : null
}

async function publish () {
  if (!datasetServer.value || !publicationSiteKey.value) return
  await flushPendingEdits()
  const id = datasetServer.value.id
  const pubSites = [
    ...(datasetServer.value.publicationSites || []).filter((s: string) => s !== publicationSiteKey.value),
    publicationSiteKey.value
  ]
  const reqSites = (datasetServer.value.requestedPublicationSites || [])
    .filter((s: string) => s !== publicationSiteKey.value)
  await $fetch(`datasets/${id}`, {
    method: 'PATCH',
    body: {
      publicationSites: pubSites,
      requestedPublicationSites: reqSites
    }
  })
  resetServerSnapshots({ publicationSites: pubSites, requestedPublicationSites: reqSites })
  const template = publicationSite.value?.datasetUrlTemplate
  if (template && (template.includes('{id}') || template.includes('{slug}'))) {
    window.location.href = template.replace('{id}', id).replace('{slug}', datasetServer.value.slug)
  } else {
    router.push({ path: `/dataset/${id}` })
  }
}

async function requestPublication () {
  if (!datasetServer.value || !publicationSiteKey.value) return
  await flushPendingEdits()
  const id = datasetServer.value.id
  const reqSites = [
    ...(datasetServer.value.requestedPublicationSites || []).filter((s: string) => s !== publicationSiteKey.value),
    publicationSiteKey.value
  ]
  await $fetch(`datasets/${id}`, {
    method: 'PATCH',
    body: {
      requestedPublicationSites: reqSites
    }
  })
  resetServerSnapshots({ requestedPublicationSites: reqSites })
  router.push({ path: '/' })
}

const doPublish = useAsyncAction(async () => {
  if (canPublishDirectly.value) await publish()
  else await requestPublication()
})

const isNextEnabled = computed(() => {
  if (currentStep.value === 1) return !!publicationSite.value
  if (currentStep.value === 2) return !!datasetServer.value && !alreadyPublished.value
  if (currentStep.value === 3) return true
  if (currentStep.value === 4) return metadataValid.value
  if (currentStep.value === 5) return true
  return false
})

const nextButtonText = computed(() => {
  if (currentStep.value === 5) return canPublishDirectly.value ? t('publish') : t('requestPublication')
  return t('continue')
})

function goToPrev () {
  if (currentStep.value > 1) {
    currentStep.value -= 1
  }
}

async function goToNext () {
  if (currentStep.value === 5) {
    await doPublish.execute()
  } else {
    currentStep.value += 1
  }
}
</script>
