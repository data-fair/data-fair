<template>
  <div style="position: relative">
    <v-text-field
      v-if="search && !noInteraction"
      v-model="editQ"
      :label="t('search')"
      style="position:absolute;z-index:2;"
      variant="outlined"
      color="primary"
      bg-color="surface"
      density="compact"
      width="250"
      class="ma-2"
      hide-details
      single-line
      clearable
      @keyup.enter="q = editQ"
      @click:clear="q = ''"
    >
      <template #append-inner>
        <v-btn
          :icon="mdiMagnify"
          :title="t('searchSubmit')"
          density="comfortable"
          size="small"
          variant="text"
          @click="q = editQ"
        />
      </template>
    </v-text-field>
    <dataset-map-legend
      v-if="legend && categoryProperty"
      :title="categoryProperty.title || categoryProperty['x-originalName'] || categoryProperty.key"
      :items="legend.items"
      :active-values="activeValues"
      :other-color="hasOther ? legend.otherColor : ''"
      :clickable="!noInteraction"
      @toggle="toggleValue"
    />
    <v-chip
      v-else-if="categoryWarning"
      color="warning"
      variant="tonal"
      size="small"
      style="position:absolute;bottom:24px;right:8px;z-index:2;"
    >
      {{ t('categoryInvalid', { field: category }) }}
    </v-chip>
    <div
      ref="mapEl"
      :style="'height:' + height + 'px'"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  searchSubmit: Lancer la recherche
  noGeoData: Aucune donnée géographique valide.
  noData: Aucune donnée à afficher
  mapError: "Erreur pendant le rendu de la carte :"
  categoryInvalid: La colonne "{field}" ne permet pas de catégoriser la carte
en:
  search: Search
  searchSubmit: Submit search
  noGeoData: No valid geo data
  noData: No data to display
  mapError: "Error while rendering the map:"
  categoryInvalid: Column "{field}" cannot be used to categorize the map
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import 'maplibre-gl/dist/maplibre-gl.css'
import { withQuery } from 'ufo'
import { useMap } from './use-map'
import { type ControlPosition } from 'maplibre-gl'
import { useTheme } from 'vuetify'
import { MAX_CATEGORY_VALUES, isCategoryEligible, categoryPalette, categoryMatchExpression } from './category'

const { t } = useI18n()
const { search, height, selectable, navigationPosition, noInteraction, sampling, cols, category } = defineProps({
  search: { type: Boolean, default: true },
  height: { type: Number, required: true },
  navigationPosition: { type: String as () => ControlPosition, default: 'top-right' },
  noInteraction: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  sampling: { type: String, default: null },
  cols: { type: Array as () => string[], default: () => [] },
  category: { type: String, default: '' }
})

const { id, dataset } = useDatasetStore()
const { filters, addFilter, removeFilter, queryParams: filtersQueryParams } = useFilters(dataset, { excludeKeys: ['_id_eq'] })
const conceptFilters = useConceptFilters(useReactiveSearchParams())

const mapEl = ref<HTMLElement | null>(null)
const q = defineModel<string>('q', { default: '' })
const selectedItem = defineModel<string>('selectedItem', { default: '' })
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const commonParams = computed(() => {
  const params = { ...filtersQueryParams.value, ...conceptFilters }
  if (q.value) params.q = q.value
  if (dataset.value?.draftReason) params.draft = 'true'
  if (dataset.value?.finalizedAt) params.finalizedAt = dataset.value.finalizedAt
  return params
})

const theme = useTheme()

const categoryProperty = computed(() => {
  if (!category || !dataset.value?.schema) return undefined
  const p = dataset.value.schema.find(p => p.key === category)
  if (!p) return undefined
  // schema allows null for these fields, CategoryProperty (kept dependency-free) expects undefined
  const eligible = isCategoryEligible({
    key: p.key,
    type: p.type,
    format: p.format ?? undefined,
    separator: p.separator as string | undefined,
    'x-refersTo': p['x-refersTo'] ?? undefined,
    'x-cardinality': p['x-cardinality'],
    'x-calculated': p['x-calculated'] ?? undefined,
    'x-capabilities': p['x-capabilities'] as { values?: boolean } | undefined
  })
  return eligible ? p : undefined
})
const categoryError = ref(false)
// only warn once the schema is known and the field is truly unusable, or the values fetch failed
const categoryWarning = computed(() => (!!category && !!dataset.value?.schema && !categoryProperty.value) || categoryError.value)

const categoryValues = ref<{ value: string, label: string }[] | null>(null)
watch([categoryProperty, () => dataset.value?.finalizedAt], async () => {
  categoryValues.value = null
  categoryError.value = false
  const prop = categoryProperty.value
  if (!prop) return
  // stringified + alphabetical (default sort) for deterministic value -> color assignment,
  // fetched without the current filters so colors do not remap while filtering
  const params: Record<string, string> = { size: String(MAX_CATEGORY_VALUES + 1), stringify: 'true' }
  if (dataset.value?.draftReason) params.draft = 'true'
  try {
    const values = await $fetch(`datasets/${id}/values-labels/${prop.key}`, { params }) as { value: string, label: string }[]
    if (categoryProperty.value?.key === prop.key) categoryValues.value = values
  } catch {
    if (categoryProperty.value?.key === prop.key) categoryError.value = true
  }
}, { immediate: true })

const hasOther = computed(() => (categoryValues.value?.length ?? 0) > MAX_CATEGORY_VALUES)
const legend = computed(() => {
  if (!categoryValues.value?.length) return undefined
  const values = categoryValues.value.slice(0, MAX_CATEGORY_VALUES)
  const colors = theme.current.value.colors
  const { colors: palette, otherColor } = categoryPalette(colors.primary as string, values.length, {
    bgColors: [colors.background as string, colors.surface as string],
    dark: theme.current.value.dark
  })
  return { items: values.map((v, i) => ({ ...v, color: palette[i] })), otherColor }
})
const categoryExpr = computed(() => {
  if (!legend.value || !categoryProperty.value) return undefined
  return categoryMatchExpression(categoryProperty.value.key, legend.value.items, legend.value.otherColor)
})

const categoryFilter = computed(() => filters.value.find(f =>
  f.property.key === categoryProperty.value?.key && (f.operator === 'in' || f.operator === 'eq')))
const activeValues = computed<string[]>(() => {
  const f = categoryFilter.value
  if (!f) return []
  if (f.operator === 'eq') return [f.value]
  return f.value.startsWith('"') ? JSON.parse(`[${f.value}]`) : f.value.split(',')
})
const toggleValue = (value: string) => {
  const prop = categoryProperty.value
  if (!prop) return
  const next = activeValues.value.includes(value)
    ? activeValues.value.filter(v => v !== value)
    : [...activeValues.value, value]
  if (!next.length) {
    if (categoryFilter.value) removeFilter(categoryFilter.value)
    return
  }
  const escaped = next.some(v => v.includes(',') || v.includes('"'))
    ? next.map(v => JSON.stringify(v)).join(',')
    : next.join(',')
  // addFilter replaces any existing in/eq filter on the field and normalizes single values to eq
  addFilter({ property: prop, operator: 'in', value: escaped, formattedValue: next.join(', ') })
}

const tileUrl = computed(() => {
  if (!dataset.value) return undefined
  const params: Record<string, string> = { format: 'pbf', ...commonParams.value }
  const select: string[] = []
  if (dataset.value.schema?.find(p => p.key === '_id')) select.push('_id')
  if (categoryProperty.value) select.push(categoryProperty.value.key)
  if (select.length) params.select = select.join(',')
  if (sampling) params.sampling = sampling
  let url = withQuery($siteUrl + `/data-fair/api/v1/datasets/${id}/lines`, params)
  url += '&xyz={x},{y},{z}'
  return url
})

const fetchBBOX = useFetch<{ bbox: [number, number, number, number] }>(`${$apiPath}/datasets/${id}/lines`, {
  query: computed(() => {
    const query: Record<string, string> = { format: 'geojson', size: '0', ...commonParams.value }
    if (selectedItem.value) query._id_eq = selectedItem.value
    return query
  })
})

useMap(mapEl, tileUrl, selectable, selectedItem, noInteraction, cols, navigationPosition, computed(() => fetchBBOX.data.value?.bbox), t, categoryExpr)

</script>

<style lang="css">
.maplibregl-popup-close-button {
  width: 24px;
}
.maplibregl-popup-content {
  max-height: 300px;
  overflow-y: scroll;
  color: rgba(0, 0, 0, 0.87);
}
</style>
