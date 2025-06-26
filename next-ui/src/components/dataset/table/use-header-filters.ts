import { type TableHeaderWithProperty } from './use-headers'

export const useHeaderFilters = (header: Ref<TableHeaderWithProperty>, localEnum: Ref<any[]>) => {
  const fullEnum = computed(() => {
    if (!showEnum.value) return
    const fullEnum = []
    for (const value of localEnum.value ?? []) {
      fullEnum.push({ value: value + '', important: true })
    }
    if (header.value.property.enum) {
      for (const value of header.value.property.enum.slice().sort()) {
        if (!localEnum.value?.includes(value)) fullEnum.push({ value: value + '' })
      }
    }
    return fullEnum
  })

  const showEnum = computed(() => {
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    if (localEnum.value?.length) return true
    return header.value.property.enum && header.value.property['x-cardinality'] && header.value.property['x-cardinality'] > 1
  })

  const enumDense = computed(() => showEnum.value && fullEnum.value?.length && fullEnum.value?.length > 4)

  const showExists = computed(() => {
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    if (header.value.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
    return true
  })

  const showEquals = computed(() => {
    if (showEnum.value) return false
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    if (header.value.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
    if (header.value.property.type === 'string' && (!header.value.property.format || header.value.property.format === 'uri-reference')) return true
    if (header.value.property.type === 'integer') return true
    return false
  })

  const showBoolEquals = computed(() => {
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    return !showEnum.value && header.value.property.type === 'boolean'
  })

  const showStartsWith = computed(() => header.value.property.type === 'string' && showEquals.value && !header.value.property['x-labels'])

  const showNumCompare = computed(() => {
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    return header.value.property.type === 'integer' || header.value.property.type === 'number'
  })

  const showDateCompare = computed(() => {
    if (header.value.property['x-capabilities'] && header.value.property['x-capabilities'].index === false) return false
    return header.value.property.type === 'string' && (header.value.property.format === 'date' || header.value.property.format === 'date-time')
  })
  const showSearch = computed(() => {
    if (showEnum.value) return false
    if (header.value.property['x-labels']) return false
    if (header.value.property.type !== 'string') return false
    if (header.value.property.format && header.value.property.format !== 'uri-reference') return false
    if (!header.value.property['x-capabilities'] || header.value.property['x-capabilities'].text !== false || header.value.property['x-capabilities'].textStandard !== false) return true
    return false
  })
  const showContains = computed(() => {
    return header.value.property['x-capabilities'] && header.value.property['x-capabilities'].wildcard && !header.value.property['x-labels']
  })
  const showFilters = computed(() => {
    return showEnum.value || showEquals.value || showStartsWith.value || showBoolEquals.value || showNumCompare.value || showDateCompare.value
  })

  return {
    fullEnum,
    showEnum,
    enumDense,
    showSearch,
    showContains,
    showFilters,
    showEquals,
    showStartsWith,
    showBoolEquals,
    showNumCompare,
    showDateCompare,
    showExists
  }
}

export default useHeaderFilters
