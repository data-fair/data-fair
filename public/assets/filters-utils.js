
export function filter2qs (filter, locale = 'fr') {
  if (typeof filter === 'string') return filter

  const key = escape(filter.field.key)

  if (!filter.type || filter.type === 'in') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return `${key}:(${filter.values.map(v => `"${escape(v)}"`).join(' OR ')})`
  } else if (filter.type === 'out') {
    if ([null, undefined, ''].includes(filter.values)) return null
    if (Array.isArray(filter.values) && filter.values.length === 0) return null
    return `!${key}:(${filter.values.map(v => `"${escape(v)}"`).join(' AND ')})`
  } else if (filter.type === 'interval') {
    const min = ![null, undefined, ''].includes(filter.minValue) ? escape(filter.minValue) : '*'
    const max = ![null, undefined, ''].includes(filter.maxValue) ? escape(filter.maxValue) : '*'
    return `${key}:[${escape(min)} TO ${escape(max)}]`
  } else if (filter.type === 'starts') {
    if ([null, undefined, ''].includes(filter.value)) return null
    if (filter.value.includes(',')) {
      throw new Error({
        fr: 'vous ne pouvez pas appliquer un filtre "commence par" contenant une virgule',
        en: 'You cannot use a filter "startsWith" containing a comma'
      }[locale])
    }
    return `${key}:${escape(filter.value)}*`
  }
}

export function filters2qs (filters, locale = 'fr') {
  return filters
    .filter(f => !!f)
    .map(filter2qs)
    .filter(f => !!f)
    .map(f => `(${f})`).join(' AND ')
}

// cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
export function escape (val) {
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

export function writeQueryParams (filters, query) {
  Object.keys(query).filter(key => key.endsWith('_eq')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'in' && f.values.length === 1).forEach(f => {
    query[f.field.key + '_eq'] = f.values[0]
  })
  Object.keys(query).filter(key => key.endsWith('_in')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'in' && f.values.length > 1).forEach(f => {
    query[f.field.key + '_in'] = JSON.stringify(f.values).slice(1, -1)
  })
  Object.keys(query).filter(key => key.endsWith('_starts')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'starts').forEach(f => {
    query[f.field.key + '_starts'] = f.value
  })
  Object.keys(query).filter(key => key.endsWith('_interval')).forEach(key => delete query[key])
  filters.filter(f => f.type === 'interval').forEach(f => {
    query[f.field.key + '_interval'] = JSON.stringify([f.minValue || '*', f.maxValue || '*']).slice(1, -1)
  })
}

export function readQueryParams (query, dataset) {
  const filters = []
  Object.keys(query).filter(key => key.endsWith('_eq')).forEach(key => {
    filters.push({
      type: 'in',
      field: dataset.schema.find(p => p.key === key.slice(0, -3)),
      values: [query[key]]
    })
  })
  Object.keys(query).filter(key => key.endsWith('_in')).forEach(key => {
    filters.push({
      type: 'in',
      field: dataset.schema.find(p => p.key === key.slice(0, -3)),
      values: JSON.parse(`[${query[key]}]`)
    })
  })
  Object.keys(query).filter(key => key.endsWith('_starts')).forEach(key => {
    filters.push({
      type: 'starts',
      field: dataset.schema.find(p => p.key === key.slice(0, -7)),
      value: query[key]
    })
  })
  Object.keys(query).filter(key => key.endsWith('_interval')).forEach(key => {
    const values = JSON.parse(`[${query[key]}]`)
    filters.push({
      type: 'interval',
      field: dataset.schema.find(p => p.key === key.slice(0, -9)),
      minValue: values[0],
      maxValue: values[0]
    })
  })
  return filters
}
