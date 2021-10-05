
export function filter2qs(filter, locale = 'fr') {
  const key = escape(filter.field.key)

  if (!filter.type || filter.type === 'in') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return filter.values.map(v => `${key}:"${escape(v)}"`).join(' OR ')
  } else if (filter.type === 'out') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return filter.values.map(v => `!(${key}:"${escape(v)})"`).join(' AND ')
  } else if (filter.type === 'interval') {
    if (!filter.minValue || !filter.maxValue) return null
    return `${escape(filter.field.key)}:[${filter.minValue} TO ${filter.maxValue}]`
  } else if (filter.type === 'starts') {
    if ([null, undefined, ''].includes(filter.value)) return null
    if (filter.value.includes(',')) {
    throw new Error({
      fr: 'vous ne pouvez pas appliquer un filtre "commence par" contenant une virgule',
      en: 'You cannot use a filter "startsWith" containing a comma',
    }[locale])
}
    return `${key}:${escape(filter.value)}*`
  }
}

export function filters2qs(filters, locale = 'fr') {
  return filters
    .filter(f => !!f)
    .map(filter2qs)
    .filter(f => !!f)
    .map(f => `(${f})`).join(' AND ')
}

// cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
const escape = (val) => {
  if (typeof val !== 'string') return val
  return [].map.call(val, (char) => {
    if (char === '+' ||
      char === '-' ||
      char === '&' ||
      char === '|' ||
      char === '!' ||
      char === '(' ||
      char === ')' ||
      char === '{' ||
      char === '}' ||
      char === '[' ||
      char === ']' ||
      char === '^' ||
      char === '"' ||
      char === '~' ||
      char === '*' ||
      char === '?' ||
      char === ':' ||
      char === ' ' ||
      char === '\\' ||
      char === '/'
    ) return '\\' + char
    else return char
  }).join('')
}

export function writeQueryParams(filters, query) {
  Object.keys(query).filter(key => key.endsWith('_in')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'in').forEach(f => {
    query[f.field.key + '_in'] = JSON.stringify(f.values).slice(1, -1)
  })
  Object.keys(query).filter(key => key.endsWith('_starts')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'starts').forEach(f => {
    query[f.field.key + '_starts'] = f.value
  })
}

export function readQueryParams(query, dataset) {
  const filters = []
  Object.keys(query).filter(key => key.endsWith('_in')).forEach(key => {
    filters.push({
      type: 'in',
      field: dataset.schema.find(p => p.key === key.slice(0, -3)),
      values: JSON.parse(`[${query[key]}]`),
    })
  })
  Object.keys(query).filter(key => key.endsWith('_starts')).forEach(key => {
    filters.push({
      type: 'starts',
      field: dataset.schema.find(p => p.key === key.slice(0, -7)),
      value: query[key],
    })
  })
  return filters
}
