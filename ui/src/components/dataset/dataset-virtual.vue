<template>
  <v-row class="dataset-virtual">
    <v-col>
      <h2 class="text-h6">
        {{ t('children') }}
      </h2>

      <!-- Add child autocomplete -->
      <v-autocomplete
        v-model:search="searchDataset"
        :model-value="null"
        :items="childrenItems"
        :loading="searchDatasetsAction.loading.value"
        no-filter
        hide-no-data
        item-title="title"
        item-value="id"
        :label="t('addChild')"
        :placeholder="t('search')"
        variant="outlined"
        density="compact"
        class="my-2"
        style="max-width: 400px;"
        hide-details="auto"
        return-object
        @update:model-value="addChild"
      >
        <template #item="{ item, props: itemProps }">
          <v-list-item
            v-bind="itemProps"
            :title="item.raw.title"
            :subtitle="item.raw.id"
          />
        </template>
      </v-autocomplete>

      <!-- Loading indicator -->
      <v-progress-linear
        v-if="loadingChildren"
        indeterminate
        color="primary"
        height="2"
        style="margin: 0;"
      />
      <div
        v-else
        style="max-height: 2px;"
      />

      <template v-if="Object.keys(childrenById).length">
        <!-- Children list -->
        <p
          v-if="!dataset.virtual.children.length"
          class="text-caption mt-3"
        >
          {{ t('noChild') }}
        </p>

        <v-card
          v-else
          variant="outlined"
          style="max-height: 400px; overflow-y: auto;"
        >
          <v-list>
            <v-list-item
              v-for="(child, index) in dataset.virtual.children"
              :key="child"
            >
              <v-list-item-title v-if="childrenById[child]">
                <router-link :to="`/dataset/${child}`">
                  {{ childrenById[child].title }} ({{ childrenById[child].id }})
                </router-link>
              </v-list-item-title>
              <v-list-item-subtitle v-if="childrenById[child]">
                <v-autocomplete
                  v-model:search="searchCol[child]"
                  :model-value="null"
                  :items="childrenById[child].schema.filter((f: any) => !f['x-calculated'] && !existingFields.includes(f.key))"
                  :item-title="(field: any) => field.title || field['x-originalName'] || field.key"
                  hide-no-data
                  item-value="id"
                  :label="t('addColumn')"
                  return-object
                  style="max-width: 400px;"
                  hide-details
                  density="compact"
                  variant="solo"
                  flat
                  @update:model-value="(field: any) => addField(field, child)"
                />
              </v-list-item-subtitle>
              <v-list-item-subtitle v-if="childrenById[child]">
                <dataset-virtual-child-compat
                  :parent-schema="dataset.schema"
                  :child="childrenById[child]"
                />
              </v-list-item-subtitle>
              <template #append>
                <v-icon
                  color="warning"
                  :title="t('delete')"
                  @click="deleteChild(index)"
                >
                  {{ mdiDelete }}
                </v-icon>
              </template>
            </v-list-item>
          </v-list>
        </v-card>

        <!-- Selected columns -->
        <h2 class="text-h6 mt-4">
          {{ t('selectedColumns') }}
        </h2>

        <p
          v-if="dataset.schema.filter((f: any) => !f['x-calculated']).length === 0"
          class="text-caption mt-3"
        >
          {{ t('noColumn') }}
        </p>
        <v-card
          v-else
          variant="outlined"
          style="max-height: 400px; overflow-y: auto;"
        >
          <v-list>
            <draggable
              v-model="dataset.schema"
              :options="{ handle: '.handle' }"
            >
              <template #item="{ element: field }">
                <v-list-item
                  v-show="!field['x-calculated']"
                  :key="field.key"
                >
                  <template #prepend>
                    <v-icon
                      :title="t('reorder')"
                      class="handle"
                    >
                      {{ mdiSort }}
                    </v-icon>
                  </template>
                  <v-list-item-title>{{ field.title || field['x-originalName'] || field.key }} ({{ field.key }})</v-list-item-title>
                  <template #append>
                    <v-icon
                      color="warning"
                      :title="t('delete')"
                      @click="deleteField(field)"
                    >
                      {{ mdiDelete }}
                    </v-icon>
                  </template>
                </v-list-item>
              </template>
            </draggable>
          </v-list>
        </v-card>

        <!-- Filters -->
        <h2 class="text-h6 mt-4">
          {{ t('filters') }}
        </h2>

        <v-checkbox
          v-if="dataset.schema.some((p: any) => p['x-refersTo'] === 'https://github.com/data-fair/lib/account') || dataset.virtual.filterActiveAccount"
          v-model="dataset.virtual.filterActiveAccount"
          :label="t('filterActiveAccount')"
        />

        <v-autocomplete
          v-model="searchedFilter"
          v-model:search="searchFilter"
          :items="allColumns.map((c: any) => ({ disabled: !!filtersByKey[c.key], value: c.key, title: c.title || c['x-originalName'] || c.key }))"
          hide-no-data
          :label="t('addFilter')"
          style="max-width: 400px;"
          density="compact"
          variant="outlined"
          class="my-2"
          hide-details="auto"
          @update:model-value="addFilter"
        />

        <p
          v-if="!dataset.virtual.filters?.length"
          class="text-caption mt-3"
        >
          {{ t('noFilter') }}
        </p>
        <v-list
          v-else
          variant="outlined"
          class="py-0"
        >
          <v-list-item
            v-for="filter in dataset.virtual.filters"
            :key="filter.key"
          >
            <v-list-item-title>{{ filterLabel(filter) }}</v-list-item-title>
            <v-list-item-subtitle>
              <v-select
                :model-value="filter.operator ?? 'in'"
                :label="t('filterType')"
                :items="[{ value: 'in', title: t('filterTypes.in') }, { value: 'nin', title: t('filterTypes.nin') }]"
                variant="outlined"
                hide-details
                density="compact"
                class="mt-4"
                style="max-width: 300px"
                @update:model-value="(v: string) => filter.operator = v"
              />
              <v-combobox
                v-model="filter.values"
                :items="valuesByKey[filter.key]"
                :label="t('filterValues')"
                variant="outlined"
                chips
                clearable
                multiple
                hide-details
                density="compact"
                class="mt-4"
              >
                <template #chip="{ item, props: chipProps }">
                  <v-chip
                    v-bind="chipProps"
                    size="small"
                    closable
                  >
                    {{ item.title }}
                  </v-chip>
                </template>
              </v-combobox>
            </v-list-item-subtitle>
            <template #append>
              <v-icon
                color="warning"
                :title="t('delete')"
                @click="dataset.virtual.filters = dataset.virtual.filters.filter((f: any) => f.key !== filter.key)"
              >
                {{ mdiDelete }}
              </v-icon>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  children: Jeux de donnees agreges
  addChild: Ajouter un jeu de donnees
  noChild: Aucun jeu de donnees agrege.
  selectedColumns: Colonnes selectionnees
  noColumn: Aucune colonne selectionnee.
  addColumn: ajouter une colonne
  reorder: Reordonner
  delete: Supprimer
  filterType: Type de filtre
  filterValues: Valeurs
  filterTypes:
    in: Restreindre a des valeurs
    nin: Exclure des valeurs
  filters: Filtres
  addFilter: ajouter un filtre
  noFilter: Aucun filtre defini.
  filterActiveAccount: Filtrer sur les comptes actifs
  ownerDatasets: Vos jeux de donnees
  masterData: Donnees de reference
en:
  search: Search
  children: Aggregated datasets
  addChild: Add a dataset
  noChild: No dataset aggregated.
  selectedColumns: Selected columns
  noColumn: No column inherited.
  addColumn: add a column
  reorder: Reorder
  delete: Delete
  filterType: Filter type
  filterValues: Values
  filterTypes:
    in: Restrict to some values
    nin: Exclude some values
  filters: Filters
  addFilter: add a filter
  noFilter: No filter defined.
  filterActiveAccount: Filter on active accounts
  ownerDatasets: Your datasets
  masterData: Master data
</i18n>

<script lang="ts" setup>
import { mdiDelete, mdiSort } from '@mdi/js'
import draggable from 'vuedraggable'
import { withQuery } from 'ufo'
import { $apiPath, $fetch } from '../../context.js'

const dataset = defineModel<any>({ required: true })
const { t } = useI18n({ useScope: 'local' })
useSessionAuthenticated()

// Initialize virtual defaults
if (dataset.value.virtual) {
  dataset.value.virtual.filters = dataset.value.virtual.filters || []
  dataset.value.virtual.children = dataset.value.virtual.children || []
}

// Internal state
const childrenById = ref<Record<string, any>>({})
const loadingChildren = ref(false)
const searchDataset = ref('')
const searchCol = ref<Record<string, string>>({})
const searchFilter = ref('')
const searchedFilter = ref<string | null>(null)
const refDatasets = ref<any[]>([])
const datasets = ref<any[]>([])

// Computed
const existingFields = computed(() => dataset.value?.schema?.map((f: any) => f.key) ?? [])

const filtersByKey = computed(() => {
  return (dataset.value?.virtual?.filters ?? []).reduce((a: Record<string, any>, f: any) => {
    a[f.key] = f; return a
  }, {})
})

const allColumns = computed(() => {
  let cols: any[] = []
  for (const id in childrenById.value) {
    cols = cols.concat(childrenById.value[id].schema
      .filter((c: any) => !c['x-calculated'] && !cols.find((c2: any) => c.key === c2.key)))
  }
  return cols
})

const valuesByKey = computed(() => {
  const result: Record<string, string[]> = {}
  for (const id in childrenById.value) {
    for (const col of childrenById.value[id].schema) {
      if (col.enum) {
        result[col.key] = result[col.key] || []
        for (let val of col.enum) {
          val = val + ''
          if (!result[col.key].includes(val)) result[col.key].push(val)
        }
      }
    }
  }
  return result
})

const childrenItems = computed(() => {
  let items: any[] = []
  if (refDatasets.value.length) {
    items.push({ header: t('masterData') })
    items = items.concat(refDatasets.value.filter((d: any) => d.id !== dataset.value.id && !dataset.value.virtual.children.includes(d.id)))
  }
  if (refDatasets.value.length && datasets.value.length) {
    items.push({ header: t('ownerDatasets') })
  }
  items = items.concat(datasets.value.filter((d: any) => d.id !== dataset.value.id && !dataset.value.virtual.children.includes(d.id)))
  return items
})

// Async actions
const searchDatasetsAction = useAsyncAction(async () => {
  const owner = dataset.value.owner
  const select = 'id,owner,title,schema,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,count,finalizedAt,attachmentsAsImage,-userPermissions,-links'

  const remoteServicesRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/remote-services`, {
    q: searchDataset.value,
    size: 1000,
    select: 'id,title,virtualDatasets',
    privateAccess: `${owner.type}:${owner.id}`,
    virtualDatasets: true
  }))

  if (remoteServicesRes.results.length) {
    const refDatasetsRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
      q: searchDataset.value,
      size: 20,
      select,
      id: remoteServicesRes.results.map((r: any) => r.virtualDatasets.parent.id).join(','),
      queryable: true
    }))
    refDatasets.value = refDatasetsRes.results
  } else {
    refDatasets.value = []
  }

  const datasetsRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
    q: searchDataset.value,
    size: 20,
    select,
    owner: `${owner.type}:${owner.id}`,
    queryable: true
  }))
  datasets.value = datasetsRes.results
})

async function fetchChildren () {
  if (!dataset.value?.virtual?.children?.length) {
    childrenById.value = {}
    return
  }
  loadingChildren.value = true
  const res = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
    size: 1000,
    select: 'id,title,schema,status',
    id: dataset.value.virtual.children.join(',')
  }))
  // Remove children that no longer exist
  dataset.value.virtual.children = dataset.value.virtual.children.filter((child: string) => res.results.find((d: any) => d.id === child))
  childrenById.value = res.results.reduce((a: Record<string, any>, d: any) => { a[d.id] = d; return a }, {})
  for (const child of dataset.value.virtual.children) {
    searchCol.value[child] = ''
  }
  loadingChildren.value = false
}

// Methods
async function addChild (child: any) {
  if (!child?.id) return
  dataset.value.virtual.children.push(child.id)
  searchDataset.value = ''
  await fetchChildren()
}

function deleteChild (i: number) {
  dataset.value.virtual.children.splice(i, 1)
}

function addField (field: any, child: string) {
  if (!field) return
  const newField: any = { key: field.key, title: field.title, type: field.type }
  if (field.format && field.format !== 'uri-reference') newField.format = field.format
  if (field['x-display']) newField['x-display'] = field['x-display']
  if (field['x-refersTo']) newField['x-refersTo'] = field['x-refersTo']
  if (field['x-concept']) newField['x-concept'] = field['x-concept']
  if (field['x-capabilities']) newField['x-capabilities'] = field['x-capabilities']
  dataset.value.schema.push(newField)
  searchCol.value[child] = ''
}

function deleteField (field: any) {
  dataset.value.schema = dataset.value.schema.filter((f: any) => f.key !== field.key)
}

function filterLabel (filter: any) {
  const col = allColumns.value.find((c: any) => c.key === filter.key)
  return (col && (col.title || col['x-originalName'] || col.key)) || filter.key
}

async function addFilter (key: string | null) {
  if (!key) return
  dataset.value.virtual.filters.push({ key, values: [] })
  await nextTick()
  searchFilter.value = ''
  searchedFilter.value = null
}

// Watchers
watch(searchDataset, () => searchDatasetsAction.execute(), { immediate: true })

// Initial fetch
fetchChildren()
</script>

<style>
.dataset-virtual .handle {
  cursor: grab;
}
</style>
