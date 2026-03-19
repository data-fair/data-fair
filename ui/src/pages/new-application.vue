<template>
  <v-container>
    <h1 class="text-h5 mb-6">
      {{ t('newApplication') }}
    </h1>

    <p class="text-body-1 mb-6">
      {{ t('chooseBaseApp') }}
    </p>

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
        <div class="text-h6">
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
            @click="onCreate(baseApp)"
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
                <v-icon icon="mdi-application" />
              </v-avatar>
            </template>

            <v-card-title class="text-body-1 font-weight-bold">
              {{ baseApp.title || baseApp.applicationName }}
            </v-card-title>

            <v-card-text>
              <p
                v-if="baseApp.description"
                class="text-body-2 text-medium-emphasis mb-2"
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
  </v-container>
</template>

<script lang="ts" setup>
import type { BaseApp } from '#api/types'

const { t } = useI18n()
const router = useRouter()

const baseAppsFetch = useFetch<{ results: BaseApp[], count: number }>($apiPath + '/base-applications')

const selectedBaseApp = ref<BaseApp | null>(null)

const createAction = useAsyncAction(async (baseApp: BaseApp) => {
  selectedBaseApp.value = baseApp
  const application = await $fetch('applications', { method: 'POST', body: { url: baseApp.url } })
  router.push(`/application/${(application as any).id}`)
})

function onCreate (baseApp: BaseApp) {
  if (createAction.loading.value) return
  createAction.execute(baseApp)
}
</script>

<i18n lang="yaml">
fr:
  newApplication: Configurer une nouvelle application
  chooseBaseApp: Choisissez un modèle d'application pour créer votre visualisation.
  noBaseApp: Aucun modèle d'application disponible.
en:
  newApplication: Configure a new application
  chooseBaseApp: Choose an application template to create your visualization.
  noBaseApp: No application template available.
</i18n>
