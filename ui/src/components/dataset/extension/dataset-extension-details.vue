<template>
  <div class="extension-details">
    <!-- Toolbar -->
    <v-toolbar
      color="surface"
      density="compact"
      flat
    >
      <dataset-nb-results
        :limit="0"
        :total="totalLines"
        class="ml-2"
        style="min-width:80px;max-width:80px;"
      />
      <v-text-field
        v-model="search"
        :append-inner-icon="mdiMagnify"
        :label="t('search')"
        :max-width="250"
        :min-width="170"
        class="mx-2"
        color="primary"
        density="compact"
        variant="outlined"
        clearable
        hide-details
        rounded
        @keyup.enter="refresh()"
        @click:append-inner="refresh()"
        @click:clear="search = ''; refresh()"
      />
      <v-select
        v-if="errorCount > 0"
        v-model="errorFilter"
        :items="errorFilterItems"
        :max-width="250"
        :min-width="180"
        class="mx-2"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="refresh()"
      />
      <v-spacer />
      <v-select
        v-model="pageSize"
        :items="pageSizeItems"
        :label="t('pageSize')"
        :max-width="120"
        :min-width="100"
        class="mx-2"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="page = 1; refresh()"
      />
    </v-toolbar>

    <!-- Table -->
    <div style="position: relative;">
      <v-overlay
        v-model="loading"
        class="align-center justify-center"
        contained
        persistent
      >
        <v-progress-circular
          color="primary"
          indeterminate
          size="64"
        />
      </v-overlay>

      <v-table
        class="extension-details-table"
        fixed-header
      >
        <thead>
          <!-- Group header row -->
          <tr style="border-bottom: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));">
            <th
              v-if="inputFields.length > 0"
              :colspan="inputFields.length"
              class="text-left border-e-md"
              style="font-weight: bold;"
            >
              {{ t('inputs') }}
            </th>
            <th
              v-if="outputFields.length > 0"
              :colspan="outputFields.length"
              class="text-left"
              style="font-weight: bold;"
            >
              {{ t('outputs') }}
            </th>
          </tr>
          <!-- Column header row -->
          <tr>
            <th
              v-for="(header, i) in headers"
              :key="header.key"
              :class="{
                'text-left': true,
                'border-e-md': i === inputFields.length - 1 && outputFields.length > 0,
              }"
              :title="header.title"
              style="white-space: nowrap;"
            >
              {{ header.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && results.length === 0">
            <td
              :colspan="headers.length"
              class="text-center text-medium-emphasis pa-4"
            >
              {{ t('noResults') }}
            </td>
          </tr>
          <tr
            v-for="(row, rowIdx) in results"
            :key="rowIdx"
            :class="{ 'bg-error': isErrorRow(row) }"
          >
            <td
              v-for="(header, i) in headers"
              :key="header.key"
              :class="{
                'border-e-md': i === inputFields.length - 1 && outputFields.length > 0,
              }"
              :title="String(row[header.key] ?? '')"
              style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
            >
              {{ truncate(row[header.key]) }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Pagination -->
    <div
      v-if="totalPages > 1"
      class="d-flex justify-center align-center py-2"
    >
      <v-pagination
        v-model="page"
        :length="totalPages"
        density="compact"
        rounded
        @update:model-value="refresh()"
      />
    </div>
  </div>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  pageSize: Par page
  noResults: Aucun résultat
  all: Toutes les lignes
  errorsOnly: Erreurs uniquement
  successOnly: Succès uniquement
  inputs: Entrées
  outputs: Résultats
  fetchError: Erreur lors du chargement des données
en:
  search: Search
  pageSize: Per page
  noResults: No results
  all: All lines
  errorsOnly: Errors only
  successOnly: Success only
  inputs: Inputs
  outputs: Results
  fetchError: Error while loading data
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'

const props = defineProps<{
  remoteService: string
  action: string
  dataset: any
  remoteServicesMap: Record<string, any>
  resourceUrl: string
}>()

const { t } = useI18n({ useScope: 'local' })
const { sendUiNotif } = useUiNotif()

const loading = ref(false)
const results = ref<any[]>([])
const totalLines = ref<number | undefined>(undefined)
const errorCount = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const errorFilter = ref('all')

const pageSizeItems = [5, 10, 20, 50]

const errorFilterItems = computed(() => [
  { title: t('all'), value: 'all' },
  { title: t('errorsOnly'), value: 'errors' },
  { title: t('successOnly'), value: 'success' },
])

const extensionKey = computed(() => `${props.remoteService}/${props.action}`)

const actionData = computed(() => {
  return props.remoteServicesMap[props.remoteService]?.actions[props.action]
})

/**
 * Input fields: fields from the dataset schema whose x-refersTo matches
 * one of the action's input concepts AND that are NOT from this extension.
 */
const inputFields = computed(() => {
  if (!actionData.value?.input || !props.dataset?.schema) return []
  const inputConcepts = new Set(
    actionData.value.input
      .map((i: any) => i.concept)
      .filter(Boolean)
  )
  return props.dataset.schema.filter((field: any) =>
    field['x-refersTo'] &&
    inputConcepts.has(field['x-refersTo']) &&
    field['x-extension'] !== extensionKey.value
  )
})

/**
 * Output fields: fields from the dataset schema where x-extension matches this extension.
 */
const outputFields = computed(() => {
  if (!props.dataset?.schema) return []
  return props.dataset.schema.filter((field: any) =>
    field['x-extension'] === extensionKey.value
  )
})

/**
 * Error field: the output field whose x-originalName is 'error' or '_error'.
 */
const errorField = computed(() => {
  return outputFields.value.find((field: any) =>
    field['x-originalName'] === 'error' || field['x-originalName'] === '_error'
  )
})

const errorFieldKey = computed(() => errorField.value?.key)

/**
 * Table headers: input fields then output fields.
 */
const headers = computed(() => {
  const inputHeaders = inputFields.value.map((field: any) => ({
    key: field.key,
    title: field.title || field['x-originalName'] || field.key,
  }))
  const outputHeaders = outputFields.value.map((field: any) => ({
    key: field.key,
    title: field.title || field['x-originalName'] || field.key,
  }))
  return [...inputHeaders, ...outputHeaders]
})

const selectParam = computed(() => {
  return headers.value.map(h => h.key).join(',')
})

const totalPages = computed(() => {
  if (!totalLines.value) return 0
  return Math.ceil(totalLines.value / pageSize.value)
})

function isErrorRow (row: any): boolean {
  if (!errorFieldKey.value) return false
  return !!row[errorFieldKey.value]
}

function truncate (value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length > 50) return str.substring(0, 50) + '...'
  return str
}

async function init () {
  loading.value = true
  try {
    // Fetch total line count
    const totalRes = await $fetch<any>(`${props.resourceUrl}/lines`, {
      query: { size: 0 },
    })
    totalLines.value = totalRes.total

    // Fetch error count if there is an error field
    if (errorFieldKey.value) {
      const errorRes = await $fetch<any>(`${props.resourceUrl}/lines`, {
        query: {
          size: 0,
          qs: `_exists_:${errorFieldKey.value}`,
        },
      })
      errorCount.value = errorRes.total
    }

    // Fetch first page of data
    await refresh()
  } catch (err: any) {
    sendUiNotif({ type: 'error', msg: t('fetchError'), error: err })
  } finally {
    loading.value = false
  }
}

async function refresh () {
  loading.value = true
  try {
    const query: Record<string, any> = {
      size: pageSize.value,
      page: page.value,
    }
    if (selectParam.value) {
      query.select = selectParam.value
    }
    if (search.value) {
      query.q = search.value
    }
    if (errorFilter.value === 'errors' && errorFieldKey.value) {
      query.qs = `_exists_:${errorFieldKey.value}`
    } else if (errorFilter.value === 'success' && errorFieldKey.value) {
      query.qs = `!(_exists_:${errorFieldKey.value})`
    }

    const res = await $fetch<any>(`${props.resourceUrl}/lines`, { query })
    results.value = res.results
    totalLines.value = res.total
  } catch (err: any) {
    sendUiNotif({ type: 'error', msg: t('fetchError'), error: err })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  init()
})
</script>

<style scoped>
.extension-details-table :deep(tr.bg-error td) {
  background-color: rgb(var(--v-theme-error), 0.12);
}
</style>
