import { type SchemaProperty } from '#api/types'

export type DatasetFilter = {
  property: SchemaProperty,
  operator: 'in' | 'nin' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'search' | 'contains' | 'starts'
  value: string,
  formattedValue: string,
  hidden?: boolean
}

export const operators = ['in', 'nin', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'search', 'contains', 'starts']

export const useFilters = () => {
  const filters = ref<DatasetFilter[]>([])

  const addFilter = (filter: DatasetFilter) => {
    const existingFilter = filters.value.find(f => f.property === filter.property && f.operator === filter.operator)
    if (existingFilter) removeFilter(existingFilter)
    filters.value.push(markRaw(filter))
  }

  const removeFilter = (filter: DatasetFilter) => {
    filters.value = filters.value.filter(f => f !== toRaw(filter))
  }

  const reactiveSearchParams = useReactiveSearchParams()
  const { dataset } = useDatasetStore()
  const localeDayjs = useLocaleDayjs()

  const queryParamsFilters = computed(() => {
    const queryParamsFilters: DatasetFilter[] = []
    for (const [key, value] of Object.entries(reactiveSearchParams)) {
      const operator = operators.find(op => key.endsWith('_' + op)) as DatasetFilter['operator']
      if (!operator) continue
      const propKey = key.slice(0, key.length - (operator.length + 1))
      const property = dataset.value?.schema?.find(p => p.key === propKey)
      if (!property) continue
      queryParamsFilters.push({ property, operator, value, formattedValue: formatValue(value, property, null, localeDayjs) })
    }
    return queryParamsFilters
  })

  const queryParams = computed(() => {
    const params: Record<string, string> = {}
    for (const filter of filters.value) {
      params[`${filter.property.key}_${filter.operator}`] = filter.value
    }
    return params
  })

  watch(queryParamsFilters, () => {
    for (const filter of queryParamsFilters.value) {
      if (filters.value.some(f => f.property.key === filter.property.key && f.operator === filter.operator)) continue
      addFilter(filter)
    }
  }, { immediate: true })

  watch(queryParams, () => {
    for (const filter of queryParamsFilters.value) {
      if (filters.value.some(f => f.property.key === filter.property.key && f.operator === filter.operator)) continue
      delete reactiveSearchParams[`${filter.property.key}_${filter.operator}`]
    }
    for (const [key, value] of Object.entries(queryParams.value)) {
      reactiveSearchParams[key] = value
    }
  })

  return { filters, queryParams, addFilter, removeFilter }
}
