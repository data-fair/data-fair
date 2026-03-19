<template>
  <v-container>
    <!-- Toolbar: search, sort, new application button -->
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
          to="/new-application"
        >
          {{ t('newApplication') }}
        </v-btn>
      </v-col>
    </v-row>

    <!-- Skeleton loader -->
    <v-row
      v-if="applicationsFetch.loading.value && !applicationsFetch.data.value"
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
      v-else-if="applicationsFetch.data.value && !applicationsFetch.data.value.count"
      justify="center"
      class="mt-6"
    >
      <v-col
        cols="auto"
        class="text-center"
      >
        <div class="text-h6">
          {{ q ? t('noResult') : t('noApplication') }}
        </div>
      </v-col>
    </v-row>

    <!-- Application cards -->
    <template v-else-if="applicationsFetch.data.value">
      <v-row class="d-flex align-stretch">
        <v-col
          v-for="application in applicationsFetch.data.value.results"
          :key="application.id"
          cols="12"
          sm="6"
          md="4"
          class="d-flex"
        >
          <v-card
            :to="`/application/${application.id}`"
            class="w-100"
          >
            <v-card-title class="text-body-1 font-weight-bold">
              {{ application.title || application.id }}
            </v-card-title>
            <v-card-text>
              <p
                v-if="application.description"
                class="text-body-2 text-medium-emphasis mb-2"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
              >
                {{ application.description }}
              </p>
              <div class="d-flex flex-wrap ga-2 align-center">
                <v-chip
                  v-if="application.status"
                  size="small"
                  :color="statusColor(application.status)"
                  variant="tonal"
                >
                  {{ t('status.' + application.status) }}
                </v-chip>
              </div>
            </v-card-text>
            <v-card-subtitle
              v-if="application.updatedAt"
              class="text-caption"
            >
              {{ t('updatedAt', { date: formatDate(application.updatedAt) }) }}
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

const applicationsParams = computed(() => {
  const params: Record<string, any> = {
    size,
    page: page.value,
    select: 'title,description,status,updatedAt,publicationSites',
    sort: sort.value,
  }
  if (q.value) params.q = q.value
  if (owner.value) params.owner = owner.value
  return params
})

const applicationsFetch = useFetch<{ results: any[], count: number }>($apiPath + '/applications', { query: applicationsParams })

const totalPages = computed(() => {
  const count = applicationsFetch.data.value?.count ?? 0
  return Math.ceil(count / size)
})

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    running: 'success',
    error: 'error',
    stopped: 'warning',
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
  newApplication: Nouvelle application
  noApplication: Vous n'avez pas encore configuré d'application.
  noResult: Aucun résultat ne correspond à la recherche.
  updatedAt: Mis à jour le {date}
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
  status:
    running: En cours
    error: Erreur
    stopped: Arrêté
    configured: Configuré
en:
  search: Search
  sort: Sort by
  newApplication: New application
  noApplication: You haven't configured any application yet.
  noResult: No result matches the search.
  updatedAt: Updated on {date}
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
  status:
    running: Running
    error: Error
    stopped: Stopped
    configured: Configured
</i18n>
