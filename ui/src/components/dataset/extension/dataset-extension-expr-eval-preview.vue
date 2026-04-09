<template>
  <div class="extension-expr-eval-preview">
    <!-- Expression field -->
    <v-text-field
      v-model="localExpr"
      :label="t('expr')"
      :error-messages="parsingError ?? undefined"
      class="mb-2"
      color="primary"
      density="compact"
      variant="outlined"
    />

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
      <v-spacer />
      <v-select
        v-model="pageSize"
        :items="pageSizeItems"
        :label="t('lines')"
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
        class="expr-eval-preview-table"
        fixed-header
      >
        <thead>
          <!-- Group header row -->
          <tr style="border-bottom: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));">
            <th
              class="text-left border-e-md"
              style="font-weight: bold;"
            >
              {{ t('results') }}
            </th>
            <th
              v-if="inputFields.length > 0"
              :colspan="inputFields.length"
              class="text-left"
              style="font-weight: bold;"
            >
              {{ t('params') }}
            </th>
          </tr>
          <!-- Column header row -->
          <tr>
            <th
              v-for="(header, i) in headers"
              :key="header.value"
              :class="{
                'text-left': true,
                'border-e-md': i === 0,
              }"
              :title="header.text"
              style="white-space: nowrap;"
            >
              {{ header.text }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && data.results.length === 0">
            <td
              :colspan="headers.length"
              class="text-center text-medium-emphasis pa-4"
            >
              {{ t('noResults') }}
            </td>
          </tr>
          <tr
            v-for="(row, rowIdx) in data.results"
            :key="rowIdx"
          >
            <template v-for="(header, i) in headers">
              <!-- Result column: show evaluated result -->
              <td
                v-if="i === 0 && extensionResults[rowIdx] && 'result' in extensionResults[rowIdx]"
                :key="header.value"
                class="text-primary border-e-md"
                style="font-weight: bold; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                :title="String(extensionResults[rowIdx].result ?? '')"
              >
                {{ truncate(extensionResults[rowIdx].result) }}
              </td>
              <td
                v-else-if="i === 0 && extensionResults[rowIdx] && 'error' in extensionResults[rowIdx]"
                :key="header.value + '-err'"
                class="text-error border-e-md"
                style="font-weight: bold; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                :title="extensionResults[rowIdx].error"
              >
                {{ truncate(extensionResults[rowIdx].error) }}
              </td>
              <td
                v-else-if="i === 0"
                :key="header.value + '-empty'"
                class="border-e-md"
              />
              <!-- Parameter columns -->
              <td
                v-else
                :key="header.value"
                style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                :title="String(row[header.value] ?? '')"
              >
                {{ truncate(row[header.value]) }}
              </td>
            </template>
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
  noResults: Aucun résultat
  lines: lignes
  errorFetch: Erreur pendant la récupération des données
  params: Paramètres
  results: Résultats
  expr: Expression
  emptyExpr: Saisissez une expression
en:
  search: Search
  noResults: No results
  lines: lines
  errorFetch: Error while fetching data
  params: Parameters
  results: Results
  expr: Expression
  emptyExpr: Write an expression
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
// @ts-ignore -- shared module
import exprEvalFactory from '#shared/expr-eval.js'
// @ts-ignore -- shared module
import { getExtensionKey } from '#shared/utils/extensions.js'

const props = defineProps<{
  extension: any
  dataset: any
  resourceUrl: string
}>()

const emit = defineEmits<{
  'update:expr': [value: string]
}>()

const { t } = useI18n({ useScope: 'local' })
const { sendUiNotif } = useUiNotif()

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const exprEval = exprEvalFactory(defaultTimezone)

const loading = ref(false)
const data = ref<{ results: any[], total: number }>({ results: [], total: 0 })
const totalLines = ref<number | undefined>(undefined)
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const localExpr = ref(props.extension.expr ?? '')
const parsingError = ref<string | null>(null)
const parsedExpression = ref<((data: any) => any) | null>(null)

const pageSizeItems = [5, 10, 20, 50]

// Sync local expression with parent
watch(localExpr, (val) => emit('update:expr', val))
watch(() => props.extension.expr, (val) => {
  if (val !== localExpr.value) localExpr.value = val ?? ''
})

// Parse expression whenever it changes
watch(localExpr, (val) => {
  if (!val || !val.trim()) {
    parsingError.value = t('emptyExpr')
    parsedExpression.value = null
    return
  }
  try {
    const property = props.dataset.schema.find((p: any) => p.key === props.extension.property.key) ?? props.extension.property
    parsedExpression.value = exprEval.compile(val, property)
    parsingError.value = null
  } catch (err: any) {
    parsingError.value = err.message
    parsedExpression.value = null
  }
}, { immediate: true })

// Input fields: all schema fields except the extension's own property
const inputFields = computed(() => {
  return props.dataset.schema.filter((f: any) => f['x-extension'] !== props.extension.property?.key)
})

// Headers: output field first, then all input fields
const headers = computed(() => {
  const outputField = props.extension.property
  const outputHeader = {
    text: outputField?.title || outputField?.['x-originalName'] || outputField?.key || '',
    sortable: false,
    value: outputField?.key ?? '',
  }
  const inputHeaders = inputFields.value.map((field: any) => ({
    text: field.title || field['x-originalName'] || field.key,
    sortable: field.type === 'string' || field.type === 'number' || field.type === 'integer',
    value: field.key,
  }))
  return [outputHeader, ...inputHeaders]
})

// Unflatten dot-separated keys into nested objects
// e.g. { "a.b": 1 } => { a: { b: 1 } }
function unflattenRow (row: any): any {
  const result: any = {}
  for (const key of Object.keys(row)) {
    const parts = key.split('.')
    let target = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in target)) target[parts[i]] = {}
      target = target[parts[i]]
    }
    target[parts[parts.length - 1]] = row[key]
  }
  return result
}

// Evaluate expression on each row of data
const extensionResults = computed(() => {
  return data.value.results.map((result: any) => {
    if (!parsedExpression.value) return null
    try {
      // WARNING: this code is duplicated in server/utils/extensions.ts
      const rowData = unflattenRow(result)

      for (const prop of props.dataset.schema) {
        const ext = props.dataset.extensions?.find((e: any) => prop.key.startsWith(getExtensionKey(e) + '.'))
        if (ext) {
          const extKey = getExtensionKey(ext)
          rowData[extKey] = rowData[extKey] ? { ...rowData[extKey] } : {}
          const shortKey = prop.key.replace(extKey + '.', '')
          rowData[extKey][shortKey] = rowData[extKey][shortKey] ?? null
        } else {
          rowData[prop.key] = rowData[prop.key] ?? null
        }
      }

      return { result: parsedExpression.value(rowData) }
    } catch (err: any) {
      return { error: err.message }
    }
  })
})

const totalPages = computed(() => {
  if (!totalLines.value) return 0
  return Math.ceil(totalLines.value / pageSize.value)
})

function truncate (value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length > 50) return str.substring(0, 50) + '...'
  return str
}

async function refresh () {
  loading.value = true
  try {
    const query: Record<string, any> = {
      size: pageSize.value,
      page: page.value,
    }
    if (search.value) {
      query.q = search.value
    }

    const res = await $fetch<any>(`${props.resourceUrl}/lines`, { query })
    data.value = res
    totalLines.value = res.total
  } catch (err: any) {
    sendUiNotif({ type: 'error', msg: t('errorFetch'), error: err })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refresh()
})
</script>

<style scoped>
.expr-eval-preview-table :deep(thead tr:first-child th) {
  border-bottom: none;
}
</style>
