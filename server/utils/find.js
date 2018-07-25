const config = require('config')

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
  let size = defaultSize
  if (query && query.size && !isNaN(parseInt(query.size))) {
    size = parseInt(query.size)
  }

  let skip = 0
  if (query && query.skip && !isNaN(parseInt(query.skip))) {
    skip = parseInt(query.skip)
  } else if (query && query.page && !isNaN(parseInt(query.page))) {
    skip = (parseInt(query.page) - 1) * size
  }

  return [skip, size]
}

exports.project = (selectStr, exclude = []) => {
  const select = {_id: 0}
  if (!selectStr) {
    exclude.forEach(e => {
      select[e] = 0
    })
  } else {
    selectStr.split(',').forEach(s => {
      select[s] = 1
    })
    Object.assign(select, {permissions: 1, id: 1, owner: 1})
    exclude.forEach(e => {
      delete select[e]
    })
  }
  return select
}

exports.parametersDoc = (filterFields) => [
  { in: 'query',
    name: 'size',
    description: 'Le nombre de résultats à retourner (taille de la pagination)',
    required: false,
    schema: {
      default: 10,
      type: 'integer'
    }
  },
  { in: 'query',
    name: 'skip',
    description: 'Nombre de résultats à ignorer. Permet par exemple de lire la prochaine page de données',
    required: false,
    schema: {
      default: 0,
      type: 'integer'
    }
  },
  { in: 'query',
    name: 'sort',
    description: `Permet de trier les résultat. Utiliser la syntaxte suivante : id_champ:1 ou idchamp:-1 suivant pour avoir un tri par ordre croissant ou décroissant respectivement`,
    required: false,
    schema: {
      default: 1,
      type: 'string'
    }
  }
].concat(filterFields.concat([{
  param: 'owner-type',
  title: 'Type de propriétaire (user ou organization)'
}, {
  param: 'owner-id',
  title: 'Identifiant du propriétaire'
}]))

exports.setResourceLinks = (resource, resourceType) => {
  resource.href = `${config.publicUrl}/api/v1/${resourceType}s/${resource.id}`
  resource.page = `${config.publicUrl}/${resourceType}/${resource.id}`
}
