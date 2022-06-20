const config = require('config')
const createError = require('http-errors')
const permissions = require('./permissions')
const visibility = require('./visibility')

// Util functions shared accross the main find (GET on collection) endpoints

function queryVal (val) {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}

exports.query = (req, fieldsMap, globalMode, extraFilters = []) => {
  const query = {}
  if (!req.query) return query

  if (req.query.q) {
    query.$text = {
      $search: req.query.q
    }
  }

  query.$and = [...extraFilters]

  // "standard" field mapping for applications/apis/datasets routes
  // @deprecated owner-type and owner-id : we shall use the owner parameter bellow : owner=organization:id1,user:id2,organization:id3
  Object.assign(fieldsMap, {
    'owner-type': 'owner.type',
    'owner-id': 'owner.id',
    status: 'status'
  })
  Object.keys(fieldsMap).filter(name => req.query[name] !== undefined).forEach(name => {
    const values = req.query[name].split(',').map(queryVal)
    const notNullValues = values.filter(v => v !== 'null')
    const or = []
    if (notNullValues.length) or.push({ [fieldsMap[name]]: { $in: notNullValues } })
    if (values.find(v => v === 'null')) {
      or.push({ [fieldsMap[name]]: { $exists: false } })
      or.push({ [fieldsMap[name]]: { $size: 0 } })
    }
    query.$and.push({ $or: or })
  })

  if (globalMode) {
    // in global mode (remote services and base-applications) the resources do not have a owner
    // they are managed by superadmin and then are shared by public / privateAccess attributes

    const showAll = req.query.showAll === 'true'
    if (showAll && !req.user.adminMode) throw createError(400, 'Only super admins can override permissions filter with showAll parameter')

    const accessFilter = []
    if (!showAll) {
      accessFilter.push({ public: true })
    }
    // You can use ?privateAccess=user:alban,organization:koumoul
    const privateAccess = []
    if (req.query.privateAccess) {
      req.query.privateAccess.split(',').forEach(p => {
        const [type, id] = p.split(':')
        if (!req.user) throw createError(401)
        if (!req.user.adminMode) {
          if (type === 'user' && id !== req.user.id) throw createError(403)
          if (type === 'organization' && !req.user.organizations.find(o => o.id === id)) throw createError(403)
        }
        privateAccess.push({ type, id })
        accessFilter.push({ privateAccess: { $elemMatch: { type, id } } })
      })
    }
    if (accessFilter.length) query.$and.push({ $or: accessFilter })
  } else {
    // in normal mode (datasets and applications) the visibility is determined from the owner and permissions

    query.$and.push({ $or: permissions.filter(req.user) })

    if (visibility.filters(req.query)) {
      query.$and.push({ $or: visibility.filters(req.query) })
    }
    if (req.query.owner) {
      delete query['owner.type']
      delete query['owner.id']
      query.$and = query.$and.concat(exports.ownerFilters(req.query, req.user && req.user.activeAccount))
    }
    if (req.query.shared === 'false' && req.user) {
      const accountFilter = { 'owner.type': req.user.activeAccount.type, 'owner.id': req.user.activeAccount.id }
      if (req.user.activeAccount.department) accountFilter['owner.department'] = req.user.activeAccount.department
      query.$and.push(accountFilter)
    }
  }
  if (!query.$and.length) delete query.$and
  return query
}

exports.ownerFilters = (reqQuery, activeAccount) => {
  const or = []
  const nor = []
  reqQuery.owner.split(',').forEach(ownerStr => {
    const [typ, id, dep] = ownerStr.split(':')
    const filter = { 'owner.type': typ.replace('-', ''), 'owner.id': id }
    if (!dep || dep === '*') {
      // no department filter to apply
    } else if (dep === '-') {
      filter['owner.department'] = { $exists: false }
    } else {
      filter['owner.department'] = dep
    }
    if (typ.startsWith('-')) nor.push(filter)
    else or.push(filter)
  })
  const and = []
  if (or.length) and.push({ $or: or })
  if (nor.length) and.push({ $nor: nor })
  return and
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

exports.pagination = (query, defaultSize = 12) => {
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

  if ((size + skip) > 10000) throw createError(400, '"size + skip" cannot be more than 10000')

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
  {
    in: 'query',
    name: 'size',
    description: 'Le nombre de résultats à retourner (taille de la pagination)',
    required: false,
    schema: {
      default: 10,
      type: 'integer'
    }
  },
  {
    in: 'query',
    name: 'skip',
    description: 'Nombre de résultats à ignorer. Permet par exemple de lire la prochaine page de données',
    required: false,
    schema: {
      default: 0,
      type: 'integer'
    }
  },
  {
    in: 'query',
    name: 'sort',
    description: 'Permet de trier les résultat. Utiliser la syntaxte suivante : id_champ:1 ou idchamp:-1 suivant pour avoir un tri par ordre croissant ou décroissant respectivement',
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

exports.setResourceLinks = (resource, resourceType, publicUrl = config.publicUrl) => {
  resource.href = `${publicUrl}/api/v1/${resourceType}s/${resource.id}`
  resource.page = `${config.publicUrl}/${resourceType}/${resource.id}`
  if (resourceType === 'application') resource.exposedUrl = `${publicUrl}/app/${resource.id}`
}

exports.facetsQuery = (req, facetFields = {}, filterFields, nullFacetFields = [], extraFilters) => {
  filterFields = filterFields || facetFields
  const facetsQueryParam = req.query.facets
  const pipeline = []

  if (req.query.q) {
    pipeline.push({
      $match: {
        $text: {
          $search: req.query.q
        }
      }
    })
  }

  // Apply as early as possible the permissions filter
  pipeline.push({
    $match: {
      $or: permissions.filter(req.user)
    }
  })
  if (req.query.shared === 'false' && req.user) {
    const accountFilter = { 'owner.type': req.user.activeAccount.type, 'owner.id': req.user.activeAccount.id }
    if (req.user.activeAccount.department) accountFilter['owner.department'] = req.user.activeAccount.department
    pipeline.push({ $match: accountFilter })
  }

  const fields = facetsQueryParam && facetsQueryParam.length && facetsQueryParam.split(',')
    .filter(f => facetFields[f] || f === 'owner' || f === 'visibility')

  if (extraFilters) {
    for (const extraFilter of extraFilters) {
      pipeline.push({ $match: extraFilter })
    }
  }

  // Apply all the filters from the current query that do not match a facetted field
  Object.keys(filterFields).filter(name => req.query[name] !== undefined && !fields.includes(name)).forEach(name => {
    pipeline.push({ $match: { [filterFields[name]]: { $in: req.query[name].split(',') } } })
  })
  if (req.query.owner && !fields.includes('owner')) {
    pipeline.push({ $match: { $and: exports.ownerFilters(req.query, req.user && req.user.activeAccount) } })
  }
  if (!fields.includes('visibility') && visibility.filters(req.query)) {
    pipeline.push({ $match: { $or: visibility.filters(req.query) } })
  }

  if (fields) {
    const facets = {}
    fields.forEach(f => {
      const facet = []
      // Apply all the filters from the current query to the facet, except the one concerning current field
      Object.keys(filterFields).filter(name => req.query[name] !== undefined && fields.includes(name) && name !== f).forEach(name => {
        facet.push({ $match: { [filterFields[name]]: { $in: req.query[name].split(',') } } })
      })
      if (req.query.owner && fields.includes('owner') && f !== 'owner') {
        facet.push({ $match: { $and: exports.ownerFilters(req.query, req.user && req.user.activeAccount) } })
      }
      if (fields.includes('visibility') && f !== 'visibility' && visibility.filters(req.query)) {
        facet.push({ $match: { $or: visibility.filters(req.query) } })
      }

      // visibility is a special case.. we do a match and count
      // for each public/private/protected instead of a $group
      if (f === 'visibility') {
        facets['visibility-public'] = [...facet, { $match: visibility.publicFilter }, { $count: 'count' }]
        facets['visibility-private'] = [...facet, { $match: visibility.privateFilter }, { $count: 'count' }]
        facets['visibility-protected'] = [...facet, { $match: visibility.protectedFilter }, { $count: 'count' }]
        return
      }

      // another special case for base-application.. we perform a join
      if (f === 'base-application') {
        facet.push({
          $lookup: {
            from: 'base-applications', localField: 'url', foreignField: 'url', as: 'base-application'
          }
        })
        facet.push({ $unwind: '$base-application' })
        facet.push({ $group: { _id: { [f]: '$base-application', id: '$id' } } })
      } else {
        facet.push({
          $unwind: {
            path: '$' + (facetFields[f] || f).split('.').shift(),
            preserveNullAndEmptyArrays: nullFacetFields.includes(f)
          }
        })
        if (f === 'owner') facet.push({ $project: { 'owner.role': 0 } })
        facet.push({ $group: { _id: { [f]: '$' + (facetFields[f] || f), id: '$id' } } })
      }

      facet.push({ $project: { [f]: '$_id.' + f, _id: 0 } })
      facet.push({ $sortByCount: '$' + f })
      facets[f] = facet
    })
    pipeline.push({ $facet: facets })
    /* pipeline.push({
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
    */
  }
  return pipeline
}

exports.parseFacets = (facets, nullFacetFields = []) => {
  if (!facets) return
  const res = {}
  Object.entries(facets.pop()).forEach(([k, values]) => {
    if (k.startsWith('visibility-')) {
      res.visibility = res.visibility || []
      res.visibility.push({ count: values[0] ? values[0].count : 0, value: k.replace('visibility-', '') })
    } else if (k === 'base-application') {
      res[k] = values.filter(r => r._id)
        .map(r => ({
          count: r.count,
          value: {
            url: r._id.url,
            version: r._id.version || (r._id.meta && r._id.meta.version),
            title: r._id.title || (r._id.meta && r._id.meta.title)
          }
        }))
    } else {
      res[k] = values
        .filter(r => r._id || nullFacetFields.includes(k))
        .map(r => ({ count: r.count, value: r._id }))
    }
  })
  Object.keys(res).forEach(facetKey => {
    res[facetKey].sort((a, b) => {
      if (a.count < b.count) return 1
      if (a.count > b.count) return -1
      let titleA = a.value?.title || a.value?.name || a.value
      if (a.value?.department) titleA += a.value.department
      let titleB = b.value?.title || b.value?.name || b.value
      if (b.value?.department) titleB += b.value.department
      if (titleA < titleB) return -1
      return 1
    })
  })
  return res
}
