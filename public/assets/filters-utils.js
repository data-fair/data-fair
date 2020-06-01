export function filter2qs(filter) {
  if (!filter.type || filter.type === 'in') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return filter.values.map(v => `${filter.field.key}:"${v}"`).join(' OR ')
  } else if (filter.type === 'out') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return filter.values.map(v => `!(${filter.field.key}:"${v})"`).join(' AND ')
  } else if (filter.type === 'interval') {
    if (!filter.minValue || !filter.maxValue) return null
    return `${filter.field.key}:[${filter.minValue} TO ${filter.maxValue}]`
  }
}

export function filters2qs(filters) {
  return filters
    .filter(f => !!f)
    .map(filter2qs)
    .filter(f => !!f)
    .map(f => `(${f})`).join(' AND ')
}
