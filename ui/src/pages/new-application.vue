<template>
  <v-container>
    <h1 class="text-title-large mb-6">
      {{ t('newApplication') }}
    </h1>

    <p class="text-body-large mb-6">
      {{ t('chooseBaseApp') }}
    </p>

    <!-- Creation type toggle -->
    <v-btn-toggle
      v-model="creationType"
      mandatory
      color="primary"
      class="mb-4"
    >
      <v-btn value="template">
        {{ t('fromTemplate') }}
      </v-btn>
      <v-btn value="copy">
        {{ t('copyExisting') }}
      </v-btn>
    </v-btn-toggle>

    <template v-if="creationType === 'template'">
      <!-- Skeleton loader -->
      <v-row
        v-if="baseAppsFetch.loading.value && !baseAppsFetch.data.value"
        class="d-flex align-stretch"
      >
        <v-col
          v-for="i in 6"
          :key="i"
          cols="12"
          sm="6"
          md="4"
          class="d-flex"
        >
          <v-skeleton-loader
            class="w-100"
            height="200"
            type="article"
          />
        </v-col>
      </v-row>

      <!-- Empty state -->
      <v-row
        v-else-if="baseAppsFetch.data.value && !baseAppsFetch.data.value.count"
        justify="center"
        class="mt-6"
      >
        <v-col
          cols="auto"
          class="text-center"
        >
          <div class="text-title-medium">
            {{ t('noBaseApp') }}
          </div>
        </v-col>
      </v-row>

      <!-- Error state -->
      <v-alert
        v-if="createAction.error.value"
        type="error"
        class="mb-4"
      >
        {{ createAction.error.value }}
      </v-alert>

      <!-- Base app cards -->
      <template v-if="baseAppsFetch.data.value && baseAppsFetch.data.value.count">
        <v-row class="d-flex align-stretch">
          <v-col
            v-for="baseApp in baseAppsFetch.data.value.results"
            :key="baseApp.id"
            cols="12"
            sm="6"
            md="4"
            class="d-flex"
          >
            <v-card
              class="w-100"
              :loading="createAction.loading.value && selectedBaseApp?.id === baseApp.id"
              hover
              @click="openCreateDialog(baseApp)"
            >
              <template
                v-if="baseApp.thumbnail"
                #prepend
              >
                <v-avatar
                  rounded="0"
                  size="48"
                >
                  <v-img
                    :src="baseApp.thumbnail"
                    :alt="baseApp.title"
                  />
                </v-avatar>
              </template>
              <template
                v-else
                #prepend
              >
                <v-avatar
                  rounded="0"
                  size="48"
                  color="primary"
                >
                  <v-icon :icon="mdiApplication" />
                </v-avatar>
              </template>

              <v-card-title class="text-body-large font-weight-bold">
                {{ baseApp.title || baseApp.applicationName }}
              </v-card-title>

              <v-card-text>
                <p
                  v-if="baseApp.description"
                  class="text-body-medium text-medium-emphasis mb-2"
                  style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
                >
                  {{ baseApp.description }}
                </p>
                <v-chip
                  v-if="baseApp.category"
                  size="small"
                  variant="tonal"
                  class="mr-1"
                >
                  {{ baseApp.category }}
                </v-chip>
                <v-chip
                  v-if="baseApp.version"
                  size="small"
                  variant="tonal"
                >
                  v{{ baseApp.version }}
                </v-chip>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </template>
    </template>

    <template v-if="creationType === 'copy'">
      <v-autocomplete
        v-model="sourceApp"
        :items="appSearchResults"
        :loading="appSearchLoading"
        item-title="title"
        item-value="id"
        return-object
        :label="t('searchApp')"
        variant="outlined"
        density="compact"
        style="max-width: 500px;"
        @update:search="searchApps"
      />
      <v-btn
        v-if="sourceApp"
        color="primary"
        class="mt-4"
        @click="openCopyDialog"
      >
        {{ t('copy') }}
      </v-btn>
    </template>

    <!-- Create dialog with title and owner -->
    <v-dialog
      v-model="showCreateDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('info') }}</v-card-title>
        <v-card-text>
          <df-owner-pick
            v-model="owner"
            hide-single
          />
          <v-text-field
            v-model="appTitle"
            :label="t('title')"
            variant="outlined"
            density="compact"
            class="mt-2"
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showCreateDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            :loading="createAction.loading.value"
            :disabled="!appTitle"
            @click="confirmCreate"
          >
            {{ t('save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { mdiApplication } from '@mdi/js'
import type { BaseApp } from '#api/types'

const { t } = useI18n()
const router = useRouter()
const { account } = useSessionAuthenticated()

const baseAppsFetch = useFetch<{ results: BaseApp[], count: number }>($apiPath + '/base-applications')

const selectedBaseApp = ref<BaseApp | null>(null)
const showCreateDialog = ref(false)
const appTitle = ref('')
const owner = ref(account.value ? { type: account.value.type, id: account.value.id, ...(account.value.department ? { department: account.value.department } : {}) } : null)

const creationType = ref<'template' | 'copy'>('template')
const sourceApp = ref<any>(null)
const appSearchResults = ref<any[]>([])
const appSearchLoading = ref(false)

async function searchApps (q: string) {
  if (!q || q.length < 2) { appSearchResults.value = []; return }
  appSearchLoading.value = true
  try {
    const data = await $fetch<{ results: any[] }>(`applications?q=${encodeURIComponent(q)}&size=20&select=title,id,url`)
    appSearchResults.value = data.results
  } finally {
    appSearchLoading.value = false
  }
}

function openCopyDialog () {
  if (!sourceApp.value) return
  selectedBaseApp.value = null
  appTitle.value = `${sourceApp.value.title} (${t('copySuffix')})`
  showCreateDialog.value = true
}

function openCreateDialog (baseApp: BaseApp) {
  if (createAction.loading.value) return
  selectedBaseApp.value = baseApp
  appTitle.value = baseApp.title || ''
  showCreateDialog.value = true
}

const createAction = useAsyncAction(async () => {
  const body: Record<string, any> = {
    title: appTitle.value
  }
  if (owner.value) body.owner = owner.value

  if (creationType.value === 'copy' && sourceApp.value) {
    body.url = sourceApp.value.url
    body.initFrom = { application: sourceApp.value.id }
  } else if (selectedBaseApp.value) {
    body.url = selectedBaseApp.value.url
  }

  const application = await $fetch<{ id: string }>('applications', { method: 'POST', body })
  showCreateDialog.value = false
  router.push(`/application/${application.id}`)
})

function confirmCreate () {
  createAction.execute()
}
</script>

<i18n lang="yaml">
fr:
  newApplication: Configurer une nouvelle application
  chooseBaseApp: Choisissez un modèle d'application pour créer votre visualisation.
  noBaseApp: Aucun modèle d'application disponible.
  info: Informations
  title: Titre de la nouvelle application
  save: Enregistrer
  cancel: Annuler
  fromTemplate: Depuis un modèle
  copyExisting: Copier une application existante
  searchApp: Rechercher une application à copier
  copy: Copier
  copySuffix: copie
en:
  newApplication: Configure a new application
  chooseBaseApp: Choose an application template to create your visualization.
  noBaseApp: No application template available.
  info: Information
  title: Title of the new application
  save: Save
  cancel: Cancel
  fromTemplate: From a template
  copyExisting: Copy an existing application
  searchApp: Search for an application to copy
  copy: Copy
  copySuffix: copy
</i18n>
