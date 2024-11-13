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

const suffixes = ['_in', '_eq', '_gte', '_lte', '_search', '_contains', '_starts']

export function writeQueryParams (dataset, filters, query, applyDatasetPrefix = false) {
  for (const key of Object.keys(query)) {
    if (key.startsWith('_c_')) continue
    if (suffixes.some(s => key.endsWith(s))) {
      delete query[key]
    }
  }

  for (const f of filters) {
    if (f.hidden) continue
    const prefix = applyDatasetPrefix ? `_d_${dataset.id}_${f.field.key}` : f.field.key
    if (f.type === 'in' && f.values.length === 1) {
      query[prefix + '_eq'] = f.values[0]
    }
    if (f.type === 'in' && f.values.length > 1) {
      query[prefix + '_in'] = JSON.stringify(f.values).slice(1, -1)
    }
    if (f.type === 'starts') {
      query[prefix + '_starts'] = f.value
    }
    if (f.type === 'contains') {
      query[prefix + '_contains'] = f.value
    }
    if (f.type === 'interval') {
      if (f.minValue !== undefined && f.minValue !== null && f.minValue !== '') {
        query[prefix + '_gte'] = f.minValue
      }
      if (f.maxValue !== undefined && f.maxValue !== null && f.maxValue !== '') {
        query[prefix + '_lte'] = f.maxValue
      }
    }
    if (f.type === 'search') {
      query[prefix + '_search'] = f.value
    }
  }
}

export function readQueryParams (query, dataset) {
  const filters = []

  Object.keys(query).forEach(key => {
    const fieldKey = key.replace(`_d_${dataset.id}_`, '').split('_').slice(0, -1).join('_')
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
      } else if (key.endsWith('_contains')) {
        filters.push({
          type: 'contains',
          field,
          value: query[key]
        })
      } else if (key.endsWith('_lte') || key.endsWith('_gte')) {
        let intervalFilter = filters.find(f => f.field === field && f.type === 'interval')
        if (!intervalFilter) {
          intervalFilter = {
            type: 'interval',
            field
          }
          filters.push(intervalFilter)
        }
        if (key.endsWith('_lte')) intervalFilter.maxValue = query[key]
        if (key.endsWith('_gte')) intervalFilter.minValue = query[key]
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
