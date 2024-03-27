
export function filter2qs (filter, locale = 'fr') {
  if (typeof filter === 'string') return filter

  let key = escape(filter.field.key)
  if (filter.nested) key += '.' + filter.nested

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
    return `${key}:[${min} TO ${max}]`
  } else if (filter.type === 'starts') {
    if ([null, undefined, ''].includes(filter.value)) return null
    if (filter.value.includes(',')) {
      throw new Error({
        fr: 'vous ne pouvez pas appliquer un filtre "commence par" contenant une virgule',
        en: 'You cannot use a filter "startsWith" containing a comma'
      }[locale])
    }
    return `${key}:${escape(filter.value)}*`
  } else if (filter.type === 'search') {
    if ([null, undefined, ''].includes(filter.value)) return null
    let subfield = 'text_standard'
    if (filter.field['x-capabilities']?.text !== false) subfield = 'text'
    return `${key}.${subfield}:${escape(filter.value)}`
  } else if (filter.type === 'contains') {
    if ([null, undefined, ''].includes(filter.value)) return null
    return `${key}.wildcard:*${escape(filter.value)}*`
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
  if (typeof val !== 'string') val = val + ''
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
  for (const key of Object.keys(query)) {
    if (key.startsWith('_c_')) continue
    if (key.endsWith('_eq') || key.endsWith('_in') || key.endsWith('_starts') || key.endsWith('_interval') || key.endsWith('_search')) {
      delete query[key]
    }
  }

  for (const f of filters) {
    if (f.hidden) continue
    if (f.type === 'in' && f.values.length === 1) {
      query[f.field.key + '_eq'] = f.values[0]
    }
    if (f.type === 'in' && f.values.length > 1) {
      query[f.field.key + '_in'] = JSON.stringify(f.values).slice(1, -1)
    }
    if (f.type === 'starts') {
      query[f.field.key + '_starts'] = f.value
    }
    if (f.type === 'interval') {
      query[f.field.key + '_interval'] = JSON.stringify([f.minValue || '*', f.maxValue || '*']).slice(1, -1)
    }
    if (f.type === 'search') {
      query[f.field.key + '_search'] = f.value
    }
  }
}

export function readQueryParams (query, dataset) {
  const filters = []

  Object.keys(query).forEach(key => {
    const fieldKey = key.split('_').slice(0, -1).join('_')
    const field = dataset.schema.find(p => p.key === fieldKey)

    if (field) {
      if (key.endsWith('_eq')) {
        filters.push({
          type: 'in',
          field,
          values: [query[key]]
        })
      } else if (key.endsWith('_in')) {
        filters.push({
          type: 'in',
          field,
          values: JSON.parse(`[${query[key]}]`)
        })
      } else if (key.endsWith('_starts')) {
        filters.push({
          type: 'starts',
          field,
          value: query[key]
        })
      } else if (key.endsWith('_interval')) {
        const values = JSON.parse(`[${query[key]}]`)
        filters.push({
          type: 'interval',
          field,
          minValue: values[0],
          maxValue: values[1]
        })
      } else if (key.endsWith('_search')) {
        filters.push({
          type: 'search',
          field,
          value: query[key]
        })
      }
    }
  })
  return filters
}
