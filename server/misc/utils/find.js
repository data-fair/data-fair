const config = /** @type {any} */(require('config'))
const createError = require('http-errors')
const i18n = require('i18n')
const permissions = require('./permissions')
const visibility = require('./visibility')

// Util functions shared accross the main find (GET on collection) endpoints

/**
 *
 * @param {string} val
 * @returns {string | boolean}
 */
function queryVal (val) {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {string} locale
 * @param {any} user
 * @param {string} resourceType
 * @param {Record<string, string>} fieldsMap
 * @param {boolean} globalMode
 * @param {any[]} extraFilters
 * @returns
 */
exports.query = (reqQuery, locale, user, resourceType, fieldsMap, globalMode, extraFilters = []) => {
  /** @type {any} */
  const query = {}
  if (!reqQuery) return query

  if (reqQuery.q) {
    query.$text = {
      $search: reqQuery.q
    }
  }

  query.$and = [...extraFilters]
  for (const name of Object.keys(fieldsMap)) {
    if (reqQuery[name] === undefined) continue
    const values = reqQuery[name].split(',').map(queryVal)
    const notNullValues = values.filter(v => v !== 'null')
    const or = []
    if (notNullValues.length) or.push({ [fieldsMap[name]]: { $in: notNullValues } })
    if (values.find(v => v === 'null')) {
      or.push({ [fieldsMap[name]]: { $exists: false } })
      or.push({ [fieldsMap[name]]: { $size: 0 } })
    }
    query.$and.push({ $or: or })
  }

  if (globalMode) {
    // in global mode (remote services and base-applications) the resources do not have a owner
    // they are managed by superadmin and then are shared by public / privateAccess attributes

    const showAll = reqQuery.showAll === 'true'
    if (showAll && !user.adminMode) throw createError(400, 'Only super admins can override permissions filter with showAll parameter')

    const accessFilter = []
    if (!showAll) {
      accessFilter.push({ public: true })
    }
    // You can use ?privateAccess=user:alban,organization:koumoul
    const privateAccess = []
    if (reqQuery.privateAccess) {
      for (const p of reqQuery.privateAccess.split(',')) {
        const [type, id] = p.split(':')
        if (!user) throw createError(401)
        if (!user.adminMode) {
          if (type === 'user' && id !== user.id) throw createError(403, i18n.__({ locale, phrase: 'errors.missingPermission' }))
          if (type === 'organization' && !user.organizations.find((/** @type{any} */o) => o.id === id)) throw createError(403, i18n.__({ locale, phrase: 'errors.missingPermission' }))
        }
        privateAccess.push({ type, id })
        accessFilter.push({ privateAccess: { $elemMatch: { type, id } } })
      }
    }
    if (accessFilter.length) query.$and.push({ $or: accessFilter })
  } else {
    // in normal mode (datasets and applications) the visibility is determined from the owner and permissions

    query.$and.push({ $or: permissions.filter(user, resourceType) })

    if (reqQuery.can) {
      query.$and.push({ $or: permissions.filterCan(user, resourceType, reqQuery.can) })
    }

    if (visibility.filters(reqQuery)) {
      query.$and.push({ $or: visibility.filters(reqQuery) })
    }
    if (reqQuery.owner) {
      delete query['owner.type']
      delete query['owner.id']
      query.$and = query.$and.concat(exports.ownerFilters(reqQuery, user && user.activeAccount))
    }
    if ((reqQuery.shared === 'false' || reqQuery.mine === 'true') && user) {
      /** @type {any} */
      const accountFilter = { 'owner.type': user.activeAccount.type, 'owner.id': user.activeAccount.id }
      if (user.activeAccount.department) accountFilter['owner.department'] = user.activeAccount.department
      query.$and.push(accountFilter)
    }
  }
  if (!query.$and.length) delete query.$and
  return query
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {any} activeAccount
 * @returns {any}
 */
exports.ownerFilters = (reqQuery, activeAccount) => {
  const or = []
  const nor = []
  for (const ownerStr of reqQuery.owner.split(',')) {
    const [typ, id, dep] = ownerStr.split(':')
    /** @type {any} */
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
  }
  const and = []
  if (or.length) and.push({ $or: or })
  if (nor.length) and.push({ $nor: nor })
  return and
}

/**
 *
 * @param {string} sortStr
 * @returns {any}
 */
exports.sort = (sortStr) => {
  /** @type {any} */
  const sort = {}
  if (!sortStr) return sort
  for (const s of sortStr.split(',')) {
    const toks = s.split(':')
    if (toks.length === 1) {
      if (s.startsWith('-')) {
        sort[s.substr(1)] = -1
      } else {
        sort[s] = 1
      }
    } else {
      sort[toks[0]] = Number(toks[1])
    }
  }
  return sort
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {number} defaultSize
 * @returns {[number, number]}
 */
exports.pagination = (reqQuery, defaultSize = 12) => {
  let size = defaultSize
  if (reqQuery && reqQuery.size && !isNaN(parseInt(reqQuery.size))) {
    size = parseInt(reqQuery.size)
  }

  let skip = 0
  if (reqQuery && reqQuery.skip && !isNaN(parseInt(reqQuery.skip))) {
    skip = parseInt(reqQuery.skip)
  } else if (reqQuery && reqQuery.page && !isNaN(parseInt(reqQuery.page))) {
    skip = (parseInt(reqQuery.page) - 1) * size
  }

  if ((size + skip) > 10000) throw createError(400, '"size + skip" cannot be more than 10000')

  return [skip, size]
}

/**
 *
 * @param {string} selectStr
 * @param {string[]} exclude
 * @param {boolean} raw
 * @returns {any}
 */
exports.project = (selectStr, exclude = [], raw = false) => {
  /** @type {any} */
  const select = { _id: 0 }
  if (!selectStr) {
    for (const e of exclude) {
      select[e] = 0
    }
  } else {
    for (const s of selectStr.split(',')) {
      select[s] = 1
    }
    if (!raw) Object.assign(select, { permissions: 1, id: 1, owner: 1 })
    for (const e of exclude) {
      delete select[e]
    }
  }
  return select
}

/**
 *
 * @param {any[]} filterFields
 * @returns {any[]}
 */
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

/**
 *
 * @param {any} resource
 * @param {string} resourceType
 * @param {string | null} publicUrl
 * @param {string | null} pageUrlTemplate
 * @param {string | null} currentAccessId
 */
exports.setResourceLinks = (resource, resourceType, publicUrl = config.publicUrl, pageUrlTemplate, currentAccessId) => {
  resource.href = `${publicUrl}/api/v1/${resourceType}s/${publicUrl === config.publicUrl ? resource.id : resource.slug}`
  resource.page = pageUrlTemplate ? pageUrlTemplate.replace('{slug}', resource.slug).replace('{id}', resource.id) : `${config.publicUrl}/${resourceType}/${resource.id}`
  if (resourceType === 'application') resource.exposedUrl = `${publicUrl}/app/${currentAccessId || (publicUrl === config.publicUrl ? resource.id : resource.slug)}`
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 * @param {string} resourceType
 * @param {any[]} [extraFilters]
 * @returns {any[]}
 */
const basePipeline = (reqQuery, user, resourceType, extraFilters) => {
  /** @type {any[]} */
  const pipeline = []

  if (reqQuery.q) {
    pipeline.push({
      $match: {
        $text: {
          $search: reqQuery.q
        }
      }
    })
  }

  // Apply as early as possible the permissions filter
  pipeline.push({
    $match: {
      $or: permissions.filter(user, resourceType)
    }
  })
  if ((reqQuery.shared === 'false' || reqQuery.mine === 'true') && user) {
    /** @type {any} */
    const accountFilter = { 'owner.type': user.activeAccount.type, 'owner.id': user.activeAccount.id }
    if (user.activeAccount.department) accountFilter['owner.department'] = user.activeAccount.department
    pipeline.push({ $match: accountFilter })
  }

  if (extraFilters) {
    for (const extraFilter of extraFilters) {
      pipeline.push({ $match: extraFilter })
    }
  }

  return pipeline
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 * @param {string} resourceType
 * @param {Record<string, string>} facetFields
 * @param {Record<string, string>} filterFields
 * @param {string[]} nullFacetFields
 * @param {any[]} [extraFilters]
 * @returns
 */
exports.facetsQuery = (reqQuery, user, resourceType, facetFields = {}, filterFields, nullFacetFields = [], extraFilters) => {
  filterFields = filterFields || facetFields
  const facetsQueryParam = reqQuery.facets
  const pipeline = basePipeline(reqQuery, user, resourceType, extraFilters)

  const fields = (facetsQueryParam && facetsQueryParam.length && facetsQueryParam.split(',')
    .filter(f => facetFields[f] || f === 'owner' || f === 'visibility')) || []

  // Apply all the filters from the current query that do not match a facetted field
  for (const name of Object.keys(filterFields)) {
    if (reqQuery[name] !== undefined && !fields.includes(name)) {
      pipeline.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
    }
  }
  if (reqQuery.owner && !fields.includes('owner')) {
    pipeline.push({ $match: { $and: exports.ownerFilters(reqQuery, user && user.activeAccount) } })
  }
  if (!fields.includes('visibility') && visibility.filters(reqQuery)) {
    pipeline.push({ $match: { $or: visibility.filters(reqQuery) } })
  }

  if (fields) {
    /** @type {Record<string, any>} */
    const facets = {}
    for (const f of fields) {
      const facet = []
      // Apply all the filters from the current query to the facet, except the one concerning current field
      for (const name of Object.keys(filterFields)) {
        if (reqQuery[name] !== undefined && fields.includes(name) && name !== f) {
          facet.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
        }
      }
      if (reqQuery.owner && fields.includes('owner') && f !== 'owner') {
        facet.push({ $match: { $and: exports.ownerFilters(reqQuery, user?.activeAccount) } })
      }
      if (fields.includes('visibility') && f !== 'visibility' && visibility.filters(reqQuery)) {
        facet.push({ $match: { $or: visibility.filters(reqQuery) } })
      }

      // visibility is a special case.. we do a match and count
      // for each public/private/protected instead of a $group
      if (f === 'visibility') {
        facets['visibility-public'] = [...facet, { $match: visibility.publicFilter }, { $count: 'count' }]
        facets['visibility-private'] = [...facet, { $match: visibility.privateFilter }, { $count: 'count' }]
        facets['visibility-protected'] = [...facet, { $match: visibility.protectedFilter }, { $count: 'count' }]
        continue
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
    }
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

/**
 *
 * @param {any} facets
 * @param {string[]} nullFacetFields
 * @returns
 */
exports.parseFacets = (facets, nullFacetFields = []) => {
  if (!facets) return

  /** @type {any} */
  const res = {}
  // @ts-ignore
  for (const [k, values] of Object.entries(facets.pop())) {
    if (k.startsWith('visibility-')) {
      res.visibility = res.visibility || []
      res.visibility.push({ count: values[0] ? values[0].count : 0, value: k.replace('visibility-', '') })
    } else if (k === 'base-application') {
      res[k] = values.filter((/** @type {any} */r) => r._id)
        .map((/** @type {any} */r) => ({
          count: r.count,
          value: {
            url: r._id.url,
            version: r._id.version || (r._id.meta && r._id.meta.version),
            title: r._id.title || (r._id.meta && r._id.meta.title)
          }
        }))
    } else {
      res[k] = values
        .filter((/** @type {any} */r) => r._id || nullFacetFields.includes(k))
        .map((/** @type {any} */r) => ({ count: r.count, value: r._id }))
    }
  }
  for (const facetKey of Object.keys(res)) {
    res[facetKey].sort((/** @type {any} */a, /** @type {any} */b) => {
      if (a.count < b.count) return 1
      if (a.count > b.count) return -1
      let titleA = a.value?.title || a.value?.name || a.value
      if (a.value?.department) titleA += a.value.department
      let titleB = b.value?.title || b.value?.name || b.value
      if (b.value?.department) titleB += b.value.department
      if (titleA < titleB) return -1
      return 1
    })
  }
  return res
}

/**
 *
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 * @param {string} resourceType
 * @param {Record<string, string>} sumFields
 * @param {Record<string, string>} filterFields
 * @param {any[]} extraFilters
 * @returns
 */
exports.sumsQuery = (reqQuery, user, resourceType, sumFields = {}, filterFields, extraFilters) => {
  const pipeline = basePipeline(reqQuery, user, resourceType, extraFilters)
  for (const name of Object.keys(filterFields)) {
    if (reqQuery[name] !== undefined) {
      pipeline.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
    }
  }
  if (reqQuery.owner) {
    pipeline.push({ $match: { $and: exports.ownerFilters(reqQuery, user?.activeAccount) } })
  }
  if (visibility.filters(reqQuery)) {
    pipeline.push({ $match: { $or: visibility.filters(reqQuery) } })
  }
  /** @type {any} */
  const group = { _id: 1 }
  for (const field of reqQuery.sums.split(',')) {
    group[field] = { $sum: '$' + sumFields[field] }
  }
  pipeline.push({ $group: group })
  pipeline.push({ $project: { _id: 0 } })
  return pipeline
}

/**
 * @param {import('mongodb').Db} db
 * @param {any} publicationSite
 * @param {any} mainPublicationSite
 * @param {Record<string, string>} reqParams
 * @param {string} resourceType
 * @param {string | null} resourceId
 * @param {boolean | undefined} tolerateStale
 */
exports.getByUniqueRef = async (db, publicationSite, mainPublicationSite, reqParams, resourceType, resourceId, tolerateStale) => {
  const paramId = resourceId ?? reqParams[resourceType + 'Id']

  /** @type {any} */
  let filter = { id: paramId }
  const options = tolerateStale ? { readPreference: 'nearest' } : {}
  if (publicationSite) {
    filter = { _uniqueRefs: paramId, 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id }
  } else if (mainPublicationSite) {
    filter = {
      $or: [
        { id: paramId },
        { _uniqueRefs: paramId, 'owner.type': mainPublicationSite.owner.type, 'owner.id': mainPublicationSite.owner.id }
      ]
    }
  }
  // @ts-ignore
  const resources = await db.collection(resourceType + 's').find(filter, options).project({ _id: 0 }).toArray()
  // req[resourceType] = req.resource =
  return resources.find(d => d.id === paramId) || resources.find(d => d.slug === paramId)
}
