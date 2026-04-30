<template>
  <v-container>
    <p v-if="datasetsErrorsFetch.data.value?.count === 0">
      {{ t('noDatasetsInError') }}
    </p>
    <template v-else-if="datasetsErrorsFetch.data.value">
      <h3 class="text-title-large">
        {{ t('datasetsInError') }}
      </h3>
      <v-sheet
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="error in datasetsErrorsFetch.data.value.results"
            :key="error.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/dataset/${error.id}`"
                target="_top"
                class="simple-link"
              >
                {{ error.title }} ({{ error.owner.name }})
              </a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ error.event.data }} ({{ dayjs(error.event.date).format("lll") }})</v-list-item-subtitle>

            <template #append>
              <v-btn
                :icon="mdiPlay"
                color="primary"
                :title="t('reindex')"
                variant="text"
                :loading="reindex.loading.value"
                @click="reindex.execute(error.id)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <p v-if="datasetsEsWarningsFetch.data.value?.count === 0">
      {{ t('noDatasetsWithEsWarnings') }}
    </p>
    <template v-else-if="datasetsEsWarningsFetch.data.value">
      <h3 class="text-title-large">
        {{ t('datasetsWithEsWarnings') }}
      </h3>
      <v-sheet
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="error in datasetsEsWarningsFetch.data.value.results"
            :key="error.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/dataset/${error.id}`"
                target="_top"
                class="simple-link"
              >
                {{ error.title }} ({{ error.owner.name }})
              </a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ error.esWarning }}</v-list-item-subtitle>

            <template #append>
              <v-btn
                :icon="mdiPlay"
                color="primary"
                :title="t('reindex')"
                variant="text"
                :loading="reindex.loading.value"
                @click="reindex.execute(error.id)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <p v-if="applicationsErrorsFetch.data.value?.count === 0">
      {{ t('noApplicationsInError') }}
    </p>
    <template v-else-if="applicationsErrorsFetch.data.value">
      <h3 class="text-title-large">
        {{ t('applicationsInError') }}
      </h3>
      <v-sheet
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="error in applicationsErrorsFetch.data.value.results"
            :key="error.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/application/${error.id}`"
                target="_top"
                class="simple-link"
              >
                {{ error.title }} ({{ error.owner.name }})
              </a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ error.errorMessage }} ({{ dayjs(error.updatedAt).format("lll") }})</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <p v-if="applicationsDraftErrorsFetch.data.value?.count === 0">
      {{ t('noApplicationsWithDraftError') }}
    </p>
    <template v-else-if="applicationsDraftErrorsFetch.data.value">
      <h3 class="text-title-large">
        {{ t('applicationsWithDraftError') }}
      </h3>
      <v-sheet
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="error in applicationsDraftErrorsFetch.data.value.results"
            :key="error.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/application/${error.id}`"
                target="_top"
                class="simple-link"
              >
                {{ error.title }} ({{ error.owner.name }})
              </a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ error.errorMessageDraft }} ({{ dayjs(error.updatedAt).format("lll") }})</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  errors: Erreurs
  reindex: Réindexer
  noDatasetsInError: Aucun jeu de données en erreur
  datasetsInError: Jeux de données en erreur
  noDatasetsWithEsWarnings: Aucun jeu de données avec avertissements Elasticsearch
  datasetsWithEsWarnings: Jeux de données avec avertissements Elasticsearch
  noApplicationsInError: Aucune application en erreur
  applicationsInError: Applications en erreur
  noApplicationsWithDraftError: Aucune application avec brouillon en erreur
  applicationsWithDraftError: Applications avec brouillon en erreur
en:
  errors: Errors
  reindex: Reindex
  noDatasetsInError: No datasets in error
  datasetsInError: Datasets in error
  noDatasetsWithEsWarnings: No datasets with Elasticsearch warnings
  datasetsWithEsWarnings: Datasets with Elasticsearch warnings
  noApplicationsInError: No applications in error
  applicationsInError: Applications in error
  noApplicationsWithDraftError: No applications with draft in error
  applicationsWithDraftError: Applications with draft in error
</i18n>

<script setup lang="ts">
import { mdiPlay } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('errors') }] })

const { dayjs } = useLocaleDayjs()

type ResourceErrors = {
  count: number,
  results: {
    title: string,
    id: string,
    errorMessage?: string,
    esWarning?: string,
    errorMessageDraft?: string,
    updatedAt: string
    owner: { type: string, id: string, name: string },
    event: { data: string, date: string }
  }[]
}

const datasetsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/datasets-errors', { query: { size: 1000 } })
const datasetsEsWarningsFetch = useFetch<ResourceErrors>($apiPath + '/admin/datasets-es-warnings', { query: { size: 1000 } })
const applicationsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-errors', { query: { size: 1000 } })
const applicationsDraftErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-draft-errors', { query: { size: 1000 } })

const reindex = useAsyncAction(async (datasetId: string) => {
  await $fetch(`datasets/${datasetId}/_reindex`, { method: 'POST' })
  datasetsErrorsFetch.refresh()
  datasetsEsWarningsFetch.refresh()
  applicationsErrorsFetch.refresh()
  applicationsDraftErrorsFetch.refresh()
})
</script>

<style lang="css">
</style>
