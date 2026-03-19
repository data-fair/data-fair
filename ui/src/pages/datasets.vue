<template>
  <v-container>
    <!-- Toolbar: search, sort, new dataset button -->
    <v-row
      align="center"
      class="mb-4"
    >
      <v-col
        cols="12"
        sm="5"
        md="4"
      >
        <v-text-field
          v-model="q"
          :label="t('search')"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          density="compact"
          variant="outlined"
        />
      </v-col>
      <v-col
        cols="12"
        sm="4"
        md="3"
      >
        <v-select
          v-model="sort"
          :label="t('sort')"
          :items="sortItems"
          hide-details
          density="compact"
          variant="outlined"
        />
      </v-col>
      <v-spacer />
      <v-col
        cols="auto"
      >
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          to="/new-dataset"
        >
          {{ t('newDataset') }}
        </v-btn>
      </v-col>
    </v-row>

    <!-- Skeleton loader -->
    <v-row
      v-if="datasetsFetch.loading.value && !datasetsFetch.data.value"
      class="d-flex align-stretch"
    >
      <v-col
        v-for="i in 12"
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
      v-else-if="datasetsFetch.data.value && !datasetsFetch.data.value.count"
      justify="center"
      class="mt-6"
    >
      <v-col
        cols="auto"
        class="text-center"
      >
        <div class="text-h6">
          {{ q ? t('noResult') : t('noDataset') }}
        </div>
      </v-col>
    </v-row>

    <!-- Dataset cards -->
    <template v-else-if="datasetsFetch.data.value">
      <v-row class="d-flex align-stretch">
        <v-col
          v-for="dataset in datasetsFetch.data.value.results"
          :key="dataset.id"
          cols="12"
          sm="6"
          md="4"
          class="d-flex"
        >
          <v-card
            :to="`/dataset/${dataset.id}`"
            class="w-100"
          >
            <v-card-title class="text-body-1 font-weight-bold">
              {{ dataset.title || dataset.id }}
            </v-card-title>
            <v-card-text>
              <p
                v-if="dataset.description"
                class="text-body-2 text-medium-emphasis mb-2"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
              >
                {{ dataset.description }}
              </p>
              <div class="d-flex flex-wrap ga-2 align-center">
                <v-chip
                  v-if="dataset.status"
                  size="small"
                  :color="statusColor(dataset.status)"
                  variant="tonal"
                >
                  {{ t('status.' + dataset.status) }}
                </v-chip>
                <span
                  v-if="dataset.count != null"
                  class="text-body-2 text-medium-emphasis"
                >
                  {{ t('records', { count: dataset.count.toLocaleString() }) }}
                </span>
              </div>
            </v-card-text>
            <v-card-subtitle
              v-if="dataset.updatedAt"
              class="text-caption"
            >
              {{ t('updatedAt', { date: formatDate(dataset.updatedAt) }) }}
            </v-card-subtitle>
          </v-card>
        </v-col>
      </v-row>

      <!-- Pagination -->
      <v-row
        v-if="totalPages > 1"
        justify="center"
        class="mt-4"
      >
        <v-col cols="auto">
          <v-pagination
            v-model="page"
            :length="totalPages"
            rounded
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
const { t, locale } = useI18n()
const session = useSessionAuthenticated()
const account = session.account

const q = useStringSearchParam('q')
const sort = useStringSearchParam('sort', 'createdAt:-1')
const pageParam = useNumberSearchParam('page')
const page = computed({
  get: () => pageParam.value ?? 1,
  set: (v: number) => { pageParam.value = v === 1 ? null : v }
})

// Reset page when search/sort changes
watch([q, sort], () => { pageParam.value = null })

const sortItems = computed(() => [
  { title: t('sortCreatedAtDesc'), value: 'createdAt:-1' },
  { title: t('sortCreatedAtAsc'), value: 'createdAt:1' },
  { title: t('sortUpdatedAtDesc'), value: 'updatedAt:-1' },
  { title: t('sortUpdatedAtAsc'), value: 'updatedAt:1' },
  { title: t('sortTitleAsc'), value: 'title:1' },
  { title: t('sortTitleDesc'), value: 'title:-1' },
])

const owner = computed(() => {
  const a = account.value
  if (!a) return undefined
  let o = a.type + ':' + a.id
  if (a.department) o += ':' + a.department
  return o
})

const size = 12

const datasetsParams = computed(() => {
  const params: Record<string, any> = {
    size,
    page: page.value,
    select: 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,count,finalizedAt,updatedAt',
    sort: sort.value,
  }
  if (q.value) params.q = q.value
  if (owner.value) params.owner = owner.value
  return params
})

const datasetsFetch = useFetch<{ results: any[], count: number }>($apiPath + '/datasets', { query: datasetsParams })

const totalPages = computed(() => {
  const count = datasetsFetch.data.value?.count ?? 0
  return Math.ceil(count / size)
})

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    finalized: 'success',
    error: 'error',
    draft: 'warning',
    indexed: 'info',
  }
  return colors[status] ?? 'default'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  search: Rechercher
  sort: Trier par
  newDataset: Nouveau jeu de données
  noDataset: Vous n'avez pas encore créé de jeu de données.
  noResult: Aucun résultat ne correspond à la recherche.
  records: "{count} enregistrement | {count} enregistrements"
  updatedAt: Mis à jour le {date}
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
  status:
    finalized: Finalisé
    error: Erreur
    draft: Brouillon
    indexed: Indexé
    loaded: Chargé
    analyzed: Analysé
    schematized: Schématisé
    normalizing: Normalisation
    indexing: Indexation
    finalizing: Finalisation
    "null": Inconnu
en:
  search: Search
  sort: Sort by
  newDataset: New dataset
  noDataset: You haven't created a dataset yet.
  noResult: No result matches the search.
  records: "{count} record | {count} records"
  updatedAt: Updated on {date}
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
  status:
    finalized: Finalized
    error: Error
    draft: Draft
    indexed: Indexed
    loaded: Loaded
    analyzed: Analyzed
    schematized: Schematized
    normalizing: Normalizing
    indexing: Indexing
    finalizing: Finalizing
    "null": Unknown
</i18n>
