// Util functions shared accross the main find (GET on collection) endpoints

exports.query = (reqQuery, fieldsMap) => {
  const query = {}
  if (!reqQuery) return query

  if (reqQuery.q) {
    query.$text = {
      $search: reqQuery.q
    }
  }

  // "standard" field mapping for applications/apis/datasets routes
  Object.assign(fieldsMap, {
    'owner-type': 'owner.type',
    'owner-id': 'owner.id'
  })
  Object.keys(fieldsMap).filter(name => reqQuery[name] !== undefined).forEach(name => {
    query[fieldsMap[name]] = {$in: reqQuery[name].split(',')}
  })
  return query
}

exports.sort = (sortStr) => {
  const sort = {}
  if (!sortStr) return sort
  sortStr.split(',').forEach(s => {
    const toks = s.split(':')
    sort[toks[0]] = Number(toks[1])
  })
  return sort
}

exports.pagination = (query, defaultSize = 10) => {
  let skip = 0
  let size = defaultSize
  if (query && query.skip && !isNaN(parseInt(query.skip))) {
    skip = parseInt(query.skip)
  }
  if (query && query.size && !isNaN(parseInt(query.size))) {
    size = parseInt(query.size)
  }
  return [skip, size]
}
