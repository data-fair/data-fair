const config = require('config')
const createError = require('http-errors')
const clone = require('fast-clone')
const permissions = require('./permissions')

// Util functions shared accross the main find (GET on collection) endpoints

exports.query = (req, fieldsMap, forceShowAll) => {
  const query = {}
  if (!req.query) return query

  if (req.query.q) {
    query.$text = {
      $search: req.query.q
    }
  }

  // "standard" field mapping for applications/apis/datasets routes
  // @deprecated owner-type and owner-id : we shall use the owner parameter bellow : owner=organization:id1,user:id2,organization:id3
  Object.assign(fieldsMap, {
    'owner-type': 'owner.type',
    'owner-id': 'owner.id',
    status: 'status'
  })
  Object.keys(fieldsMap).filter(name => req.query[name] !== undefined).forEach(name => {
    query[fieldsMap[name]] = { $in: req.query[name].split(',') }
  })

  let showAll = req.query.showAll === 'true'
  if (showAll && !req.user.isAdmin) throw createError(400, 'Only super admins can override permissions filter with showAll parameter')
  showAll = showAll || forceShowAll
  query.$and = []
  if (!showAll) query.$and.push({ $or: permissions.filter(req.user) })
  if (req.query.owner && !forceShowAll) {
    delete query['owner.type']
    delete query['owner.id']
    const ownerTypes = {}
    req.query.owner.split(',').forEach(owner => {
      const [t, id] = owner.split(':')
      ownerTypes[t] = ownerTypes[t] || []
      ownerTypes[t].push(id)
    })
    let ownerFilters = ['user', 'organization'].filter(t => ownerTypes[t]).map(t => ({ 'owner.type': t, 'owner.id': { $in: ownerTypes[t] } }))
    if (ownerTypes['-user'] || ownerTypes['-organization']) {
      ownerFilters = ownerFilters.concat(['-user', '-organization'].map(t => {
        const f = { 'owner.type': t.substring(1) }
        if (ownerTypes[t]) f['owner.id'] = { $nin: ownerTypes[t] }
        return f
      }))
    }
    query.$and.push({ $or: ownerFilters })
  }
  if (!query.$and.length) delete query.$and
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
  const select = { _id: 0 }
  if (!selectStr) {
    exclude.forEach(e => {
      select[e] = 0
    })
  } else {
    selectStr.split(',').forEach(s => {
      select[s] = 1
    })
    Object.assign(select, { permissions: 1, id: 1, owner: 1 })
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
  resource.page = `${config.publicUrl}/${resourceType}/${resource.id}/description`
  if (resourceType === 'application') resource.exposedUrl = `${config.publicUrl}/app/${resource.id}`
}

exports.facetsQuery = (reqQuery, filterFields, query) => {
  const facetsQueryParam = reqQuery.facets
  const pipeline = []
  if (query.$text) {
    pipeline.push({
      $match: {
        $text: query.$text
      }
    })
    delete query.$text
  }
  const ownerQuery = clone(query)
  if (reqQuery.owner) {
    ownerQuery.$and.pop()
    if (!ownerQuery.$and.length) delete ownerQuery.$and
  }
  const fields = facetsQueryParam && facetsQueryParam.length && facetsQueryParam.split(',').filter(f => filterFields[f] || f === 'owner')
  if (fields) {
    pipeline.push({
      $facet: Object.assign({}, ...fields.map(f => ({
        [f]: [{
          $match: f === 'owner' ? ownerQuery : query
        }, {
          $unwind: '$' + (filterFields[f] || 'owner').split('.').shift()
        }, {
          $group: {
            _id: { [f]: '$' + (filterFields[f] || 'owner'), id: '$id' }
          }
        }, { $project: { [f]: '$_id.' + f, _id: 0 }
        }, {
          $sortByCount: '$' + f
        }]
      })))
    })
  }
  return pipeline
}

exports.parseFacets = (facets) => {
  if (!facets) return
  const ret = facets.pop()
  return Object.assign({}, ...Object.keys(ret).map(k => ({ [k]: ret[k].filter(r => r._id).map(r => ({ count: r.count, value: r._id })) })))
}
