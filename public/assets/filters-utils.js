
export function filter2qs(filter) {
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
  }
}

export function filters2qs(filters) {
  return filters
    .filter(f => !!f)
    .map(filter2qs)
    .filter(f => !!f)
    .map(f => `(${f})`).join(' AND ')
}

// cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
const escape = (str) => {
  return [].map.call(str, (char) => {
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
      char === '\\' ||
      char === '/'
    ) return '\\' + char
    else return char
  }).join('')
}
