import { type SchemaProperty } from '#api/types'
import { type ExtendedResult, type ExtendedResultValue } from './lines'
import type { ExtendedDataset } from './dataset-store'

export type Operator = 'in' | 'nin' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'search' | 'contains' | 'starts' | 'exists' | 'nexists'

export type DatasetFilter = {
  property: SchemaProperty,
  operator: Operator,
  value: string,
  formattedValue: string,
  hidden?: boolean,
  // operator and value of the URL param this filter was built from. addFilter normalizes a
  // single-value "in"/"nin" into "eq"/"neq", so writing the internal operator back to the URL
  // would rewrite an embedding parent's "_in" param into "_eq" and keep the d-frame sync
  // bouncing. Keeping the origin lets queryParams write back the key it read.
  queryOperator?: Operator,
  queryValue?: string
}

export const operators: Operator[] = ['in', 'nin', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'search', 'contains', 'starts', 'exists', 'nexists']

// addFilter normalizes single-value "in"/"nin" filters to "eq"/"neq", so an internal filter
// may not carry the operator of the URL param it originated from. Treat those as equivalent
// when reconciling internal filters against the query params.
const matchesQueryOperator = (queryOperator: Operator, filterOperator: Operator) =>
  queryOperator === filterOperator ||
  (filterOperator === 'eq' && queryOperator === 'in') ||
  (filterOperator === 'neq' && queryOperator === 'nin')

export const findEqFilter = (filters: DatasetFilter[], property: SchemaProperty, result: ExtendedResult) => {
  return filters.find(f => f.property.key === property.key && f.operator === 'eq' && (Array.isArray(result.values[property.key])
    ? (result.values[property.key] as ExtendedResultValue[]).some(v => v.raw === f.value)
    : (result.values[property.key] as ExtendedResultValue).raw === f.value))
}

export const useFilters = (datasetRef: MaybeRefOrGetter<ExtendedDataset | null>, options: { excludeKeys?: string[] } = {}) => {
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
  const localeDayjs = useLocaleDayjs()

  const queryParamsFilters = computed(() => {
    const dataset = toValue(datasetRef)
    const queryParamsFilters: DatasetFilter[] = []
    for (const [key, value] of Object.entries(reactiveSearchParams)) {
      if (excludeKeys.includes(key)) continue
      const operator = operators.find(op => key.endsWith('_' + op)) as DatasetFilter['operator']
      if (!operator) continue
      const propKey = key.slice(0, key.length - (operator.length + 1))
      if (excludeKeys.includes(propKey)) continue
      const property = dataset?.schema?.find(p => p.key === propKey)
      if (!property) continue
      queryParamsFilters.push({ property, operator, value, formattedValue: formatValue(value, property, null, localeDayjs) })
    }
    return queryParamsFilters
  })

  const queryParams = computed(() => {
    const params: Record<string, string> = {}
    for (const filter of filters.value) {
      params[`${filter.property.key}_${filter.queryOperator ?? filter.operator}`] = '' + (filter.queryValue ?? filter.value)
    }
    return params
  })

  watch(queryParamsFilters, () => {
    // add filters newly present in the URL, and re-add those whose value changed. matching on
    // (key, operator) alone would ignore a value change on a key that is already filtered, e.g. an
    // embedding parent growing an "_in" param from 2 to 3 values: same key, same operator, new value.
    for (const filter of queryParamsFilters.value) {
      const existing = filters.value.find(f => f.property.key === filter.property.key && matchesQueryOperator(filter.operator, f.operator))
      if (existing && (existing.queryValue ?? existing.value) === filter.value) continue
      addFilter({ ...filter, queryOperator: filter.operator, queryValue: filter.value })
    }
    // remove filters whose query param disappeared from the URL (e.g. an embedding parent
    // dropping a key via <d-frame>). excludeKeys are managed outside this sync, leave them be.
    for (const filter of [...filters.value]) {
      if (excludeKeys.includes(`${filter.property.key}_${filter.operator}`) || excludeKeys.includes(filter.property.key)) continue
      if (queryParamsFilters.value.some(f => f.property.key === filter.property.key && matchesQueryOperator(f.operator, filter.operator))) continue
      removeFilter(filter)
    }
  }, { immediate: true })

  watch(queryParams, () => {
    // drop URL params that the internal filters no longer reproduce (filter removed, or its
    // operator changed so it is now written under another key)
    for (const filter of queryParamsFilters.value) {
      const key = `${filter.property.key}_${filter.operator}`
      if (key in queryParams.value) continue
      delete reactiveSearchParams[key]
    }
    for (const [key, value] of Object.entries(queryParams.value)) {
      reactiveSearchParams[key] = value
    }
  })

  return { filters, queryParams, addFilter, removeFilter }
}
