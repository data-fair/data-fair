<template>
  <v-container
    fluid
    class="pa-0"
  >
    <v-stepper
      v-model="step"
      style="background-color: transparent"
      flat
    >
      <v-stepper-header>
        <v-stepper-item
          v-if="!datasetId"
          value="type"
          :complete="!!creationType"
          :editable="!!creationType"
          :color="step === 'type' ? 'primary' : ''"
          :icon="mdiShape"
          :title="t('selectCreationType')"
          :subtitle="creationType ? t('type_' + creationType) : undefined"
        />
        <v-divider v-if="!datasetId" />
        <v-stepper-item
          value="selection"
          :complete="!!(creationType === 'copy' ? copyApp : selectedBaseApp)"
          :editable="!!(creationType === 'copy' ? copyApp : selectedBaseApp)"
          :color="step === 'selection' ? 'primary' : ''"
          :icon="mdiApps"
          :title="creationType === 'copy' ? t('selectApp') : t('selectBaseApp')"
        />
        <v-divider />
        <v-stepper-item
          value="info"
          :complete="!!appTitle"
          :editable="!!(creationType === 'copy' ? copyApp : selectedBaseApp)"
          :color="step === 'info' ? 'primary' : ''"
          :icon="mdiTextBox"
          :title="t('info')"
        />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Step: Type selection -->
        <v-stepper-window-item value="type">
          <p class="text-body-large mb-4">
            {{ t('choseType') }}
          </p>
          <v-row density="comfortable">
            <v-col
              v-for="type of creationTypes"
              :key="type"
              cols="12"
              sm="6"
            >
              <v-card
                class="h-100"
                :color="creationType === type ? 'primary' : ''"
                @click="selectCreationType(type)"
              >
                <v-card-title>
                  <span :class="creationType !== type ? 'text-primary' : ''">
                    <v-icon
                      class="mr-2"
                      :icon="creationTypeIcons[type]"
                    />
                    {{ t('type_' + type) }}
                  </span>
                </v-card-title>
                <v-card-text>
                  {{ t('type_desc_' + type) }}
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-stepper-window-item>

        <!-- Step: Selection -->
        <v-stepper-window-item value="selection">
          <!-- Copy mode -->
          <template v-if="creationType === 'copy'">
            <v-autocomplete
              v-model="copyApp"
              v-model:search="copySearch"
              :items="appSearchResults"
              :loading="appSearchLoading"
              item-title="title"
              item-value="id"
              return-object
              no-filter
              :label="t('searchApp')"
              :placeholder="t('search')"
              variant="outlined"
              density="compact"
              hide-details
              max-width="600"
              clearable
              @update:model-value="onCopyAppSelected"
            >
              <template #item="{ props: itemProps }">
                <v-list-item v-bind="itemProps" />
              </template>
            </v-autocomplete>
          </template>

          <!-- Base app mode -->
          <template v-if="creationType === 'baseApp'">
            <i18n-t
              keypath="customApp"
              tag="p"
              class="mb-4"
            >
              <template #highlight>
                <span class="text-accent">{{ t('customAppHighlight') }}</span>
              </template>
              <template #link>
                <a href="https://koumoul.com/contact">{{ t('customAppContact') }}</a>
              </template>
            </i18n-t>

            <v-progress-linear
              v-if="baseAppsFetch.loading.value && !baseAppsFetch.data.value"
              indeterminate
              color="primary"
              height="2"
            />

            <v-alert
              v-if="baseAppsFetch.error.value"
              type="error"
              class="mb-4"
            >
              {{ baseAppsFetch.error.value }}
            </v-alert>

            <template v-if="baseAppsFetch.data.value">
              <template
                v-for="category in categories"
                :key="category"
              >
                <h3 class="text-headline-small">
                  {{ t('appType', { category }) }}
                </h3>
                <v-row class="mt-0 mb-1">
                  <v-col
                    v-for="baseApp in baseAppsByCategory(category)"
                    :key="baseApp.id"
                    md="3"
                    sm="4"
                    cols="6"
                  >
                    <v-card
                      :color="selectedBaseApp && selectedBaseApp.id === baseApp.id ? 'primary' : ''"
                      :style="baseApp.disabled?.length ? 'cursor:default' : 'cursor:pointer'"
                      variant="outlined"
                      hover
                      @click="!baseApp.disabled?.length && selectBaseApp(baseApp)"
                    >
                      <v-img
                        v-if="baseApp.image"
                        :src="baseApp.image"
                        :alt="baseApp.title"
                        aspect-ratio="2.5"
                      />
                      <v-card-title :class="{ 'text-error': baseApp.disabled?.length }">
                        <v-icon
                          v-if="!baseApp.public"
                          :icon="mdiSecurity"
                          :title="t('restrictedAccess')"
                          class="mr-1"
                          size="small"
                        />
                        {{ baseApp.title }}
                      </v-card-title>
                      <v-card-text
                        v-if="baseApp.description"
                        class="text-body-small text-medium-emphasis"
                      >
                        {{ baseApp.description }}
                      </v-card-text>
                      <v-card-text v-if="baseApp.disabled?.length">
                        <v-alert
                          v-for="(disabled, i) in baseApp.disabled"
                          :key="'disabled-' + i"
                          type="error"
                          density="compact"
                          border="start"
                          class="my-1"
                        >
                          {{ disabled }}
                        </v-alert>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </template>
            </template>
          </template>
        </v-stepper-window-item>

        <!-- Step: Info -->
        <v-stepper-window-item value="info">
          <df-owner-pick
            v-model="owner"
            hide-single
            :current-owner="dataset?.owner"
          />
          <v-text-field
            v-model="appTitle"
            max-width="500"
            name="title"
            :label="t('title')"
            variant="outlined"
            density="compact"
          />

          <v-alert
            v-if="createError"
            type="error"
            class="mt-4 mb-4"
            max-width="500"
          >
            {{ createError }}
          </v-alert>
        </v-stepper-window-item>
      </v-stepper-window>

      <v-stepper-actions
        v-if="step !== 'type'"
        :prev-text="t('back')"
        class="justify-start ga-2"
        @click:prev="goToPrev"
      >
        <template #next>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="step === 'info' && !appTitle"
            :loading="importing"
            @click="goToNext"
          >
            {{ step === 'info' ? t('save') : t('continue') }}
          </v-btn>
        </template>
      </v-stepper-actions>
    </v-stepper>
  </v-container>
</template>

<script setup lang="ts">
import { mdiApps, mdiContentCopy, mdiSecurity, mdiShape, mdiTextBox } from '@mdi/js'
import { $apiPath, $uiConfig } from '~/context'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import type { BaseApp } from '#api/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { account } = useSessionAuthenticated()
const breadcrumbs = useBreadcrumbs()

breadcrumbs.receive({
  breadcrumbs: [{ text: t('apps'), to: '/applications' }, { text: t('breadcrumb') }]
})

// ---- Types ----
type CreationType = 'copy' | 'baseApp'

interface BaseAppWithContext extends BaseApp {
  disabled?: string[]
  public?: boolean
  image?: string
  category?: string
}

// ---- Step management ----
type StepName = 'type' | 'selection' | 'info'
const step = ref<StepName>('type')
const creationType = ref<CreationType | null>(null)
const creationTypes: CreationType[] = ['copy', 'baseApp']
const creationTypeIcons: Record<CreationType, string> = {
  copy: mdiContentCopy,
  baseApp: mdiApps
}

function selectCreationType (type: CreationType) {
  creationType.value = type
  step.value = 'selection'
}

function goToPrev () {
  if (step.value === 'selection') step.value = 'type'
  else if (step.value === 'info') step.value = 'selection'
}

function goToNext () {
  if (step.value === 'selection') step.value = 'info'
  else if (step.value === 'info') createApplication()
}

// ---- Owner ----
const owner = ref(account.value ? { type: account.value.type, id: account.value.id, name: account.value.name, ...(account.value.department ? { department: account.value.department } : {}) } : null)

const ownerFilter = computed(() => {
  const a = account.value
  if (!a) return ''
  let f = `${a.type}:${a.id}`
  if (a.department) f += `:${a.department}`
  return f
})

// ---- Dataset context (?dataset=ID) ----
const datasetId = computed(() => route.query.dataset as string | undefined)
const dataset = ref<any>(null)

onMounted(async () => {
  if (datasetId.value) {
    creationType.value = 'baseApp'
    dataset.value = await $fetch(`${$apiPath}/datasets/${datasetId.value}`)
    step.value = 'selection'
  }
})

// ---- Copy mode ----
const copyApp = ref<any>(null)
const copySearch = ref('')
const appSearchResults = ref<any[]>([])
const appSearchLoading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(copySearch, (q) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!q || q.length < 2) { appSearchResults.value = []; return }
  searchTimeout = setTimeout(() => {
    searchApplications()
  }, 300)
})

async function searchApplications () {
  appSearchLoading.value = true
  try {
    const data = await $fetch<{ results: any[] }>(`${$apiPath}/applications?q=${encodeURIComponent(copySearch.value)}&size=20&select=id,title,url,-userPermissions,-links,-owner&owner=${ownerFilter.value}`)
    appSearchResults.value = data.results
  } finally {
    appSearchLoading.value = false
  }
}

function onCopyAppSelected (app: any) {
  if (!app) return
  appTitle.value = `${app.title} (${t('copy')})`
  step.value = 'info'
}

// ---- Base app mode ----
const selectedBaseApp = ref<BaseAppWithContext | null>(null)

const baseAppsQuery = computed(() => ({
  size: 1000,
  privateAccess: ownerFilter.value,
  dataset: datasetId.value || 'any'
}))

const baseAppsFetch = useFetch<{ results: BaseAppWithContext[], count: number }>(
  () => creationType.value === 'baseApp' ? `${$apiPath}/base-applications` : null,
  { query: baseAppsQuery }
)

const categories = computed(() => {
  const apps = baseAppsFetch.data.value?.results
  if (!apps) return []
  const configCategories = ($uiConfig as any).baseAppsCategories || []
  return [...configCategories, 'autre']
    .filter((c: string) => apps.some(a => (a.category || 'autre') === c))
})

function baseAppsByCategory (category: string) {
  return baseAppsFetch.data.value?.results?.filter(a => (a.category || 'autre') === category) || []
}

function selectBaseApp (baseApp: BaseAppWithContext) {
  selectedBaseApp.value = baseApp
  if (dataset.value) {
    appTitle.value = `${dataset.value.title} - ${baseApp.title}`
  } else {
    appTitle.value = baseApp.title || ''
  }
  step.value = 'info'
}

// ---- Info ----
const appTitle = ref('')
const importing = ref(false)
const createError = ref<string | null>(null)

// ---- Create ----
async function createApplication () {
  importing.value = true
  createError.value = null
  try {
    const body: Record<string, any> = {
      title: appTitle.value
    }
    if (owner.value) body.owner = owner.value

    if (creationType.value === 'copy' && copyApp.value) {
      body.url = copyApp.value.url
      body.initFrom = { application: copyApp.value.id }
    } else if (selectedBaseApp.value) {
      body.url = selectedBaseApp.value.url
      body.configurationDraft = {}
      if (dataset.value) {
        body.configurationDraft.datasets = [{
          href: dataset.value.href,
          title: dataset.value.title,
          id: dataset.value.id,
          schema: dataset.value.schema
        }]
      }
    }

    const application = await $fetch<{ id: string }>(`${$apiPath}/applications`, { method: 'POST', body })
    router.push(`/application/${application.id}`)
  } catch (error: any) {
    createError.value = error.response?.data?.message || error.data?.message || error.message || t('creationError')
    importing.value = false
  }
}
</script>

<i18n lang="yaml">
fr:
  apps: Applications
  breadcrumb: Créer une application
  selectCreationType: Type d'initialisation
  choseType: Choisissez la manière dont vous souhaitez initialiser une nouvelle application.
  selectBaseApp: Sélection du modèle d'application
  selectApp: Sélection de l'application à copier
  info: Informations
  customApp: "Koumoul réalise aussi des {highlight} sur demande. N'hésitez pas à {link} !"
  customAppHighlight: applications personnalisées
  customAppContact: nous contacter
  title: Titre de la nouvelle application
  save: Enregistrer
  back: Retour
  continue: Continuer
  creationError: Erreur pendant la création de l'application
  copy: copie
  type_copy: Copie d'application
  type_desc_copy: Copiez une configuration complète depuis une application existante.
  type_baseApp: Nouvelle configuration
  type_desc_baseApp: Créez une configuration vierge à partir d'un modèle d'application.
  appType: "Application de type {category}"
  searchApp: Choisissez une application
  search: Rechercher
  restrictedAccess: Application à accès restreint
en:
  apps: Applications
  breadcrumb: Create an application
  selectCreationType: Initialization type
  choseType: Choose how you would like to initialize a new application.
  selectBaseApp: Application model selection
  selectApp: Application to copy
  info: Information
  customApp: "Koumoul also creates {highlight} on demand. Do not hesitate {link}!"
  customAppHighlight: custom applications
  customAppContact: contacting us
  title: Title of the new application
  save: Save
  back: Back
  continue: Continue
  creationError: Error while creating the application
  copy: copy
  type_copy: Application copy
  type_desc_copy: Copy a complete configuration from an existing application.
  type_baseApp: New configuration
  type_desc_baseApp: Create a blank configuration from an application model.
  appType: "Application of type {category}"
  searchApp: Choose an application
  search: Search
  restrictedAccess: Application with restricted access
</i18n>
