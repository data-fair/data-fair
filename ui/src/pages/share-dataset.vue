<template>
  <v-container style="max-width: 800px;">
    <h1 class="text-h5 mb-4">
      {{ t('shareDataset') }}
    </h1>

    <v-stepper
      v-model="currentStep"
      flat
    >
      <v-stepper-header>
        <v-stepper-item
          :value="1"
          :complete="!!publicationSite"
          :title="t('stepPortal')"
          :subtitle="publicationSite ? truncate(publicationSite.title || publicationSite.url || publicationSite.id, 30) : undefined"
          editable
        />
        <v-divider />
        <v-stepper-item
          :value="2"
          :complete="!!dataset"
          :title="t('stepDataset')"
          :subtitle="dataset ? truncate(dataset.title, 30) : undefined"
          :editable="!!publicationSite"
        />
        <v-divider />
        <v-stepper-item
          :value="3"
          :title="t('stepPermissions')"
          :editable="!!dataset && !alreadyPublished"
        />
        <v-divider />
        <v-stepper-item
          :value="4"
          :complete="metadataValid"
          :title="t('stepMetadata')"
          :subtitle="metadataValid ? t('completed') : undefined"
          :editable="!!publicationSite && !!dataset"
        />
        <v-divider />
        <v-stepper-item
          :value="5"
          :title="t('stepAction')"
          :editable="metadataValid"
        />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Step 1: Portal selection -->
        <v-stepper-window-item :value="1">
          <div class="pa-4">
            <v-alert
              v-if="publicationSitesFetch.data.value && !publicationSites.length"
              type="warning"
              variant="outlined"
              style="max-width: 500px;"
            >
              {{ t('noPublicationSite') }}
            </v-alert>
            <template v-if="publicationSites.length">
              <p class="text-body-1 mb-2">
                {{ t('selectPortal') }}
              </p>
              <v-card
                variant="outlined"
                style="max-width: 500px;"
              >
                <v-list>
                  <v-list-item
                    v-for="(site, i) in publicationSites"
                    :key="i"
                    :active="!!(publicationSite && site.type === publicationSite.type && site.id === publicationSite.id)"
                    color="primary"
                    @click="selectSite(site)"
                  >
                    <v-list-item-title>{{ site.title || site.url || site.id }}</v-list-item-title>
                    <v-list-item-subtitle v-if="site.department">
                      {{ site.departmentName || site.department }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card>
            </template>

            <v-btn
              color="primary"
              class="mt-4"
              :disabled="!publicationSite"
              @click="currentStep = 2"
            >
              {{ t('continue') }}
            </v-btn>
          </div>
        </v-stepper-window-item>

        <!-- Step 2: Dataset selection -->
        <v-stepper-window-item :value="2">
          <div class="pa-4">
            <dataset-select
              v-model="selectedDataset"
              :owner="datasetOwner"
              @update:model-value="onDatasetSelected"
            />

            <v-alert
              v-if="alreadyPublished"
              type="warning"
              variant="outlined"
              density="compact"
              class="mt-4"
              style="max-width: 600px;"
            >
              {{ t('alreadyPublished') }}
            </v-alert>

            <v-btn
              color="primary"
              class="mt-4"
              :disabled="!dataset || alreadyPublished"
              @click="currentStep = 3"
            >
              {{ t('continue') }}
            </v-btn>
          </div>
        </v-stepper-window-item>

        <!-- Step 3: Permissions -->
        <v-stepper-window-item :value="3">
          <div class="pa-4">
            <v-alert
              type="info"
              variant="tonal"
              style="max-width: 600px;"
            >
              {{ t('permissionsNote') }}
            </v-alert>

            <v-btn
              color="primary"
              class="mt-4"
              @click="currentStep = 4"
            >
              {{ t('continue') }}
            </v-btn>
          </div>
        </v-stepper-window-item>

        <!-- Step 4: Metadata -->
        <v-stepper-window-item :value="4">
          <div class="pa-4">
            <v-form
              v-if="dataset && publicationSite"
              v-model="metadataValid"
            >
              <v-text-field
                v-model="datasetTitle"
                :label="t('datasetTitle')"
                :rules="[v => !!v || t('required')]"
                variant="outlined"
                density="compact"
                class="mb-2"
                style="max-width: 600px;"
              />
              <v-textarea
                v-model="datasetDescription"
                :label="t('datasetDescription')"
                variant="outlined"
                density="compact"
                rows="4"
                style="max-width: 600px;"
              />
            </v-form>

            <v-btn
              color="primary"
              class="mt-4"
              :disabled="!metadataValid"
              @click="saveMetadataAndContinue"
            >
              {{ t('continue') }}
            </v-btn>
          </div>
        </v-stepper-window-item>

        <!-- Step 5: Action / Confirmation -->
        <v-stepper-window-item :value="5">
          <div class="pa-4">
            <template v-if="dataset && publicationSite">
              <v-btn
                v-if="canPublishDirectly"
                color="primary"
                @click="publish"
              >
                {{ t('publish') }}
              </v-btn>
              <v-btn
                v-else
                color="primary"
                @click="requestPublication"
              >
                {{ t('requestPublication') }}
              </v-btn>
            </template>
          </div>
        </v-stepper-window-item>
      </v-stepper-window>
    </v-stepper>
  </v-container>
</template>

<i18n lang="yaml">
fr:
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
  completed: complètes
  alreadyPublished: Ce jeu de données est déjà publié sur ce portail.
  noPublicationSite: Aucun portail n'est configuré sur ce compte.
  permissionsNote: Les permissions du jeu de données seront conservées. Vous pouvez les modifier depuis la page du jeu de données après publication.
  datasetTitle: Titre
  datasetDescription: Description
  required: Ce champ est requis
en:
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
  completed: completed
  alreadyPublished: This dataset is already published on this portal.
  noPublicationSite: No portal is configured for this account.
  permissionsNote: The dataset permissions will be preserved. You can modify them from the dataset page after publication.
  datasetTitle: Title
  datasetDescription: Description
  required: This field is required
</i18n>

<script lang="ts" setup>
import { $fetch, $apiPath } from '~/context'
import type { ListedDataset } from '~/components/dataset/select/utils'

const { t } = useI18n()
const { account } = useSessionAuthenticated()
const { canAdmin } = usePermissions()
const router = useRouter()

const currentStep = ref(1)
const publicationSite = ref<Record<string, any> | null>(null)
const selectedDataset = ref<ListedDataset | undefined>()
const dataset = ref<Record<string, any> | null>(null)
const metadataValid = ref(false)
const datasetTitle = ref('')
const datasetDescription = ref('')

// Fetch publication sites for the account (including all departments for orgs without department)
const settingsPath = computed(() => {
  if (!account.value) return null
  let path = `${account.value.type}/${account.value.id}`
  if (account.value.type === 'organization' && !account.value.department) {
    path += ':*'
  }
  return path
})

const publicationSitesFetch = useFetch<Record<string, any>[]>(
  () => settingsPath.value ? `${$apiPath}/settings/${settingsPath.value}/publication-sites` : null
)

const publicationSites = computed(() => publicationSitesFetch.data.value ?? [])

// Owner for dataset search, scoped by portal department
const datasetOwner = computed(() => {
  if (!account.value || !publicationSite.value) return null
  return {
    type: account.value.type,
    id: account.value.id,
    department: publicationSite.value.department || account.value.department
  }
})

// Publication site key for comparing
const publicationSiteKey = computed(() => {
  if (!publicationSite.value) return null
  return `${publicationSite.value.type}:${publicationSite.value.id}`
})

// Check if dataset is already published on selected site
const alreadyPublished = computed(() => {
  return !!(publicationSiteKey.value && dataset.value?.publicationSites?.includes(publicationSiteKey.value))
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

function truncate (str: string | undefined, len: number): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

function selectSite (site: Record<string, any>) {
  publicationSite.value = site
  // Reset dataset selection when portal changes
  selectedDataset.value = undefined
  dataset.value = null
  currentStep.value = 2
}

async function onDatasetSelected (selected: ListedDataset | undefined) {
  if (!selected) {
    dataset.value = null
    return
  }
  // Load full dataset
  try {
    dataset.value = await $fetch<Record<string, any>>(`datasets/${selected.id}`)
    datasetTitle.value = dataset.value?.title ?? ''
    datasetDescription.value = dataset.value?.description ?? ''
    if (!alreadyPublished.value) {
      currentStep.value = 3
    }
  } catch {
    dataset.value = null
  }
}

async function saveMetadataAndContinue () {
  if (!dataset.value || !metadataValid.value) return
  try {
    await $fetch(`datasets/${dataset.value.id}`, {
      method: 'PATCH',
      body: {
        title: datasetTitle.value,
        description: datasetDescription.value
      }
    })
    currentStep.value = 5
  } catch {
    // keep user on this step on error
  }
}

async function publish () {
  if (!dataset.value || !publicationSiteKey.value) return
  const pubSites = [...(dataset.value.publicationSites || []).filter((s: string) => s !== publicationSiteKey.value), publicationSiteKey.value]
  const reqSites = (dataset.value.requestedPublicationSites || []).filter((s: string) => s !== publicationSiteKey.value)
  await $fetch(`datasets/${dataset.value.id}`, {
    method: 'PATCH',
    body: {
      publicationSites: pubSites,
      requestedPublicationSites: reqSites
    }
  })
  if (publicationSite.value?.datasetUrlTemplate) {
    window.location.href = publicationSite.value.datasetUrlTemplate
      .replace('{id}', dataset.value.id)
      .replace('{slug}', dataset.value.slug)
  } else {
    router.push({ path: `/dataset/${dataset.value.id}` })
  }
}

async function requestPublication () {
  if (!dataset.value || !publicationSiteKey.value) return
  const reqSites = [...(dataset.value.requestedPublicationSites || []).filter((s: string) => s !== publicationSiteKey.value), publicationSiteKey.value]
  await $fetch(`datasets/${dataset.value.id}`, {
    method: 'PATCH',
    body: {
      requestedPublicationSites: reqSites
    }
  })
  router.push({ path: '/' })
}
</script>
