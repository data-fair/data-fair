import type { SessionState } from '@data-fair/lib-express'
import type { ResourceType } from '#types'
import mongo from '#mongo'
import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import i18n from 'i18n'
import * as permissions from './permissions.ts'
import * as visibility from './visibility.ts'

// Util functions shared accross the main find (GET on collection) endpoints

/**
 *
 * @returns {string | boolean}
 */
function queryVal (val: string) {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}

/**
 *
 * @returns
 */
export const query = (reqQuery: Record<string, string>, locale: string, sessionState: SessionState, resourceType: string, fieldsMap: Record<string, string>, globalMode: boolean, extraFilters: any[] = []) => {
  const query: any = {}
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
    if (or.length) query.$and.push({ $or: or })
  }

  if (globalMode) {
    // in global mode (remote services and base-applications) the resources do not have a owner
    // they are managed by superadmin and then are shared by public / privateAccess attributes

    const showAll = reqQuery.showAll === 'true'
    if (showAll && !sessionState?.user?.adminMode) throw httpError(400, 'Only super admins can override permissions filter with showAll parameter')

    const accessFilter = []
    if (!showAll) {
      accessFilter.push({ public: true })
    }
    // You can use ?privateAccess=user:alban,organization:koumoul
    const privateAccess = []
    if (reqQuery.privateAccess) {
      for (const p of reqQuery.privateAccess.split(',')) {
        const [type, id] = p.split(':')
        if (!sessionState.user) throw httpError(401)
        if (!sessionState.user.adminMode) {
          if (type === 'user' && id !== sessionState.user.id) throw httpError(403, i18n.__({ locale, phrase: 'errors.missingPermission' }))
          if (type === 'organization' && !sessionState.user.organizations.find((o: any) => o.id === id)) throw httpError(403, i18n.__({ locale, phrase: 'errors.missingPermission' }))
        }
        privateAccess.push({ type, id })
        accessFilter.push({ privateAccess: { $elemMatch: { type, id } } })
      }
    }
    if (accessFilter.length) query.$and.push({ $or: accessFilter })
  } else {
    // in normal mode (datasets and applications) the visibility is determined from the owner and permissions

    query.$and.push({ $or: permissions.filter(sessionState, resourceType as ResourceType) })

    if (reqQuery.can) {
      query.$and.push({ $or: permissions.filterCan(sessionState, resourceType as ResourceType, reqQuery.can) })
    }

    const visibilityFilters = visibility.filters(reqQuery)
    if (visibilityFilters?.length) {
      query.$and.push({ $or: visibility.filters(reqQuery) })
    }
    if (reqQuery.owner) {
      delete query['owner.type']
      delete query['owner.id']
      query.$and = query.$and.concat(ownerFilters(reqQuery))
    }
    if ((reqQuery.shared === 'false' || reqQuery.mine === 'true') && sessionState.account) {
      const accountFilter: any = { 'owner.type': sessionState.account.type, 'owner.id': sessionState.account.id }
      if (sessionState.account.department) accountFilter['owner.department'] = sessionState.account.department
      query.$and.push(accountFilter)
    }
  }
  if (!query.$and.length) delete query.$and
  return query
}

/**
 *
 * @returns {any}
 */
export const ownerFilters = (reqQuery: Record<string, string>): any => {
  const or = []
  const nor = []
  for (const ownerStr of reqQuery.owner.split(',')) {
    const [typ, id, dep] = ownerStr.split(':')
    const filter: any = { 'owner.type': typ.replace('-', ''), 'owner.id': id }
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
 * @returns {any}
 */
export const sort = (sortStr: string | undefined = '', q: string | undefined = ''): any => {
  const sort: any = {}
  for (const s of sortStr.split(',').filter(Boolean)) {
    const toks = s.split(':')
    if (toks.length === 1) {
      if (s.startsWith('-')) {
        sort[s.substr(1)] = -1
      } else {
        sort[s] = 1
      }
    } else {
      sort[toks[0]] = Number(toks[1])
      if (sort[toks[0]] !== 1 && sort[toks[0]] !== -1) throw httpError(400, `bad sort order "${s}"`)
    }
  }
  if (q) sort._score = { $meta: 'textScore' }
  return sort
}

/**
 *
 * @returns {[number, number]}
 */
export const pagination = (reqQuery: Record<string, string>, defaultSize: number = 12): [number, number] => {
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

  if ((size + skip) > 10000) throw httpError(400, '"size + skip" cannot be more than 10000')

  return [skip, size]
}

/**
 *
 * @returns {any}
 */
export const project = (selectStr: string, exclude: string[] = [], raw: boolean = false): any => {
  const select: any = { _id: 0 }
  if (!selectStr) {
    for (const e of exclude) {
      select[e] = 0
    }
  } else {
    for (const s of selectStr.split(',')) {
      select[s] = 1
    }
    if (!raw) Object.assign(select, { permissions: 1, id: 1, owner: 1, slug: 1 })
    for (const e of exclude) {
      delete select[e]
    }
  }
  return select
}

/**
 *
 * @returns {any[]}
 */
export const parametersDoc = (filterFields: any[]): any[] => [
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

export const setResourceLinks = (resource: any, resourceType: string, publicUrl: string | null = config.publicUrl, pageUrlTemplate: string | null, currentAccessId: string | null) => {
  resource.href = `${publicUrl}/api/v1/${resourceType}s/${publicUrl === config.publicUrl ? resource.id : resource.slug}`
  resource.page = pageUrlTemplate ? pageUrlTemplate.replace('{slug}', resource.slug).replace('{id}', resource.id) : `${config.publicUrl}/${resourceType}/${resource.id}`
  if (resourceType === 'application') resource.exposedUrl = `${publicUrl}/app/${currentAccessId || (publicUrl === config.publicUrl ? resource.id : resource.slug)}`
}

/**
 *
 * @returns {any[]}
 */
const basePipeline = (reqQuery: Record<string, string>, sessionState: SessionState, resourceType: string, extraFilters?: any[]): any[] => {
  const pipeline: any[] = []

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
      $or: permissions.filter(sessionState, resourceType as ResourceType)
    }
  })
  if ((reqQuery.shared === 'false' || reqQuery.mine === 'true') && sessionState.account) {
    const accountFilter: any = { 'owner.type': sessionState.account.type, 'owner.id': sessionState.account.id }
    if (sessionState.account.department) accountFilter['owner.department'] = sessionState.account.department
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
 * @returns
 */
export const facetsQuery = (reqQuery: Record<string, string>, sessionState: SessionState, resourceType: string, facetFields: Record<string, string> = {}, filterFields: Record<string, string>, nullFacetFields: string[] = [], extraFilters?: any[]) => {
  filterFields = filterFields || facetFields
  const facetsQueryParam = reqQuery.facets
  const pipeline = basePipeline(reqQuery, sessionState, resourceType, extraFilters)

  const fields = (facetsQueryParam && facetsQueryParam.length && facetsQueryParam.split(',')
    .filter((f: string) => facetFields[f] || f === 'owner' || f === 'visibility')) || []

  // Apply all the filters from the current query that do not match a facetted field
  for (const name of Object.keys(filterFields)) {
    if (reqQuery[name] !== undefined && !fields.includes(name)) {
      pipeline.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
    }
  }
  if (reqQuery.owner && !fields.includes('owner')) {
    pipeline.push({ $match: { $and: ownerFilters(reqQuery) } })
  }
  if (!fields.includes('visibility')) {
    const visibilityFilters = visibility.filters(reqQuery)
    if (visibilityFilters?.length) pipeline.push({ $match: { $or: visibility.filters(reqQuery) } })
  }

  if (fields) {
    const facets: Record<string, any> = {}
    for (const f of fields) {
      const facet: any[] = []
      // Apply all the filters from the current query to the facet, except the one concerning current field
      for (const name of Object.keys(filterFields)) {
        if (reqQuery[name] !== undefined && fields.includes(name) && name !== f) {
          facet.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
        }
      }
      if (reqQuery.owner && fields.includes('owner') && f !== 'owner') {
        facet.push({ $match: { $and: ownerFilters(reqQuery) } })
      }
      if (fields.includes('visibility') && f !== 'visibility') {
        const visibilityFilters = visibility.filters(reqQuery)
        if (visibilityFilters?.length) facet.push({ $match: { $or: visibility.filters(reqQuery) } })
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
        facet.push({ $project: { [f]: '$_id.' + f, _id: 0 } })
        facet.push({ $sortByCount: '$' + f })
      } else if (f === 'conformsTo') {
        // conformsTo is a single object per dataset (not an array) — group by its triple
        facet.push({ $match: { conformsTo: { $exists: true } } })
        facet.push({
          $group: {
            _id: { title: '$conformsTo.title', version: '$conformsTo.version', url: '$conformsTo.url' },
            count: { $sum: 1 }
          }
        })
        facet.push({ $sort: { count: -1 } })
      } else if (f === 'topics') {
        facet.push({
          $unwind: {
            path: '$topics'
          }
        })
        facet.push({
          $group: {
            _id: { topics: '$topics.id' },
            topics: { $first: '$topics' },
            count: { $sum: 1 }
          }
        })
        facet.push({ $sort: { count: -1 } })
        facet.push({ $project: { _id: '$topics', count: 1 } })
      } else if (f === 'owner') {
        facet.push({
          $group: {
            _id: { ownerType: '$owner.type', ownerId: '$owner.id', ownerDepartment: '$owner.department' },
            owner: { $first: '$owner' },
            count: { $sum: 1 }
          }
        })
        facet.push({ $sort: { count: -1 } })
        facet.push({ $project: { _id: '$owner', count: 1 } })
        facet.push({ $project: { 'owner.role': 0 } })
      } else {
        facet.push({
          $unwind: {
            path: '$' + (facetFields[f] || f).split('.').shift(),
            preserveNullAndEmptyArrays: nullFacetFields.includes(f)
          }
        })
        facet.push({ $group: { _id: { [f]: '$' + (facetFields[f] || f), id: '$id' } } })
        facet.push({ $project: { [f]: '$_id.' + f, _id: 0 } })
        facet.push({ $sortByCount: '$' + f })
      }

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
 * @returns
 */
export const parseFacets = (facets: any, nullFacetFields: string[] = []) => {
  if (!facets) return

  const res: any = {}
  for (const [k, values] of Object.entries<any>(facets.pop())) {
    if (k.startsWith('visibility-')) {
      res.visibility = res.visibility || []
      res.visibility.push({ count: values[0] ? values[0].count : 0, value: k.replace('visibility-', '') })
    } else if (k === 'base-application') {
      res[k] = values.filter((r: any) => r._id)
        .map((r: any) => ({
          count: r.count,
          value: {
            url: r._id.url,
            version: r._id.version || (r._id.meta && r._id.meta.version),
            title: r._id.title || (r._id.meta && r._id.meta.title)
          }
        }))
    } else {
      res[k] = values
        .filter((r: any) => r._id || nullFacetFields.includes(k))
        .map((r: any) => ({ count: r.count, value: r._id }))
    }
  }
  for (const facetKey of Object.keys(res)) {
    res[facetKey].sort((a: any, b: any) => {
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
 * @returns
 */
export const sumsQuery = (reqQuery: Record<string, string>, sessionState: SessionState, resourceType: string, sumFields: Record<string, string> = {}, filterFields: Record<string, string>, extraFilters: any[]) => {
  const pipeline = basePipeline(reqQuery, sessionState, resourceType, extraFilters)
  for (const name of Object.keys(filterFields)) {
    if (reqQuery[name] !== undefined) {
      pipeline.push({ $match: { [filterFields[name]]: { $in: reqQuery[name].split(',') } } })
    }
  }
  if (reqQuery.owner) {
    pipeline.push({ $match: { $and: ownerFilters(reqQuery) } })
  }
  const visibilityFilters = visibility.filters(reqQuery)
  if (visibilityFilters?.length) {
    pipeline.push({ $match: { $or: visibility.filters(reqQuery) } })
  }
  const group: any = { _id: 1 }
  for (const field of reqQuery.sums.split(',')) {
    group[field] = { $sum: '$' + sumFields[field] }
  }
  pipeline.push({ $group: group })
  pipeline.push({ $project: { _id: 0 } })
  return pipeline
}

export const getByUniqueRef = async (publicationSite: any, mainPublicationSite: any, reqParams: Record<string, string>, resourceType: string, resourceId: string | null) => {
  const paramId = resourceId ?? reqParams[resourceType + 'Id']

  let filter: any = { id: paramId }
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
  const resources = await mongo.db.collection(resourceType + 's').find(filter).project({ _id: 0 }).toArray()
  // req[resourceType] = req.resource =
  return resources.find((d: any) => d.id === paramId) || resources.find((d: any) => d.slug === paramId)
}
