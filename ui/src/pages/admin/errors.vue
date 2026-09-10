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
            <v-list-item-subtitle v-if="error.integrityIssue">
              {{ t(error.integrityIssue) }}
              <template v-if="error.integrityCheckedAt">
                ({{ dayjs(error.integrityCheckedAt).format("lll") }})
              </template>
            </v-list-item-subtitle>
            <v-list-item-subtitle v-else-if="error.event">
              {{ error.event.data }} ({{ dayjs(error.event.date).format("lll") }})
            </v-list-item-subtitle>

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
  breach: "Intégrité rompue : le contenu a divergé de son ancrage"
  trail-altered: "Historique de révisions altéré : révisions masquées ou réécrites"
  datasetsInError: Jeux de données en erreur
  noApplicationsInError: Aucune application en erreur
  applicationsInError: Applications en erreur
  noApplicationsWithDraftError: Aucune application avec brouillon en erreur
  applicationsWithDraftError: Applications avec brouillon en erreur
en:
  errors: Errors
  reindex: Reindex
  noDatasetsInError: No datasets in error
  breach: "Integrity breach: content diverged from its anchor"
  trail-altered: "Integrity trail altered: revisions hidden or rewritten"
  datasetsInError: Datasets in error
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
    errorMessageDraft?: string,
    updatedAt: string
    owner: { type: string, id: string, name: string },
    event?: { data: string, date: string }
    // set when the dataset is listed for a compromised integrity rather than a pipeline error:
    // its real status stays 'finalized' and its last journal event describes an unrelated run
    integrityIssue?: 'breach' | 'trail-altered' | null
    integrityCheckedAt?: string
  }[]
}

const datasetsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/datasets-errors', { query: { size: 1000 } })
const applicationsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-errors', { query: { size: 1000 } })
const applicationsDraftErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-draft-errors', { query: { size: 1000 } })

const reindex = useAsyncAction(async (datasetId: string) => {
  await $fetch(`datasets/${datasetId}/_reindex`, { method: 'POST' })
  datasetsErrorsFetch.refresh()
  applicationsErrorsFetch.refresh()
  applicationsDraftErrorsFetch.refresh()
})
</script>

<style lang="css">
</style>
