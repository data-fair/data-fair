import { type SchemaProperty } from '#api/types'
import { type ExtendedResult, type ExtendedResultValue } from './dataset-lines'

export type Operator = 'in' | 'nin' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'search' | 'contains' | 'starts' | 'exists' | 'nexists'

export type DatasetFilter = {
  property: SchemaProperty,
  operator: Operator,
  value: string,
  formattedValue: string,
  hidden?: boolean
}

export const operators: Operator[] = ['in', 'nin', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'search', 'contains', 'starts', 'exists', 'nexists']

export const findEqFilter = (filters: DatasetFilter[], property: SchemaProperty, result: ExtendedResult) => {
  return filters.find(f => f.property.key === property.key && f.operator === 'eq' && (Array.isArray(result.values[property.key])
    ? (result.values[property.key] as ExtendedResultValue[]).some(v => v.raw === f.value)
    : (result.values[property.key] as ExtendedResultValue).raw === f.value))
}

export const useFilters = (options: { excludeKeys?: string[] } = {}) => {
  const { excludeKeys = [] } = options
  const filters = ref<DatasetFilter[]>([])

  const addFilter = (filter: DatasetFilter) => {
    const existingFilter = filters.value.find(f => f.property.key === filter.property.key && f.operator === filter.operator)
    if (existingFilter) removeFilter(existingFilter)
    if (filter.operator === 'in') {
      const existingEqFilter = filters.value.find(f => f.property.key === filter.property.key && f.operator === 'eq')
      if (existingEqFilter) removeFilter(existingEqFilter)
    }
    if (filter.operator === 'nin') {
      const existingNEqFilter = filters.value.find(f => f.property.key === filter.property.key && f.operator === 'neq')
      if (existingNEqFilter) removeFilter(existingNEqFilter)
    }
    if (filter.operator === 'exists') {
      const existingNExistsFilter = filters.value.find(f => f.property.key === filter.property.key && f.operator === 'nexists')
      if (existingNExistsFilter) removeFilter(existingNExistsFilter)
    }
    if (filter.operator === 'nexists') {
      const existingExistsFilter = filters.value.find(f => f.property.key === filter.property.key && f.operator === 'exists')
      if (existingExistsFilter) removeFilter(existingExistsFilter)
    }
    if (filter.value === '') return

    // special case for "in" filters, if there is a single item use "eq" and remove if 0 items
    if (filter.operator === 'in') {
      const values = filter.value.startsWith('"') ? JSON.parse(`[${filter.value}]`) : filter.value.split(',')
      if (values.length === 0) {
        // nothing to do
      } else if (values.length === 1) {
        filters.value.push(markRaw({ ...filter, operator: 'eq', value: values[0] }))
      } else {
        filters.value.push(markRaw(filter))
      }
    } else if (filter.operator === 'nin') {
      const values = filter.value.startsWith('"') ? JSON.parse(`[${filter.value}]`) : filter.value.split(',')
      if (values.length === 0) {
        // nothing to do
      } else if (values.length === 1) {
        filters.value.push(markRaw({ ...filter, operator: 'neq', value: values[0] }))
      } else {
        filters.value.push(markRaw(filter))
      }
    } else {
      filters.value.push(markRaw(filter))
    }
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
      if (excludeKeys.includes(key)) continue
      const operator = operators.find(op => key.endsWith('_' + op)) as DatasetFilter['operator']
      if (!operator) continue
      const propKey = key.slice(0, key.length - (operator.length + 1))
      if (excludeKeys.includes(propKey)) continue
      const property = dataset.value?.schema?.find(p => p.key === propKey)
      if (!property) continue
      queryParamsFilters.push({ property, operator, value, formattedValue: formatValue(value, property, null, localeDayjs) })
    }
    return queryParamsFilters
  })

  const queryParams = computed(() => {
    const params: Record<string, string> = {}
    for (const filter of filters.value) {
      params[`${filter.property.key}_${filter.operator}`] = '' + filter.value
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
