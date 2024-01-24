const findUtils = require('../misc/utils/find')
const permissions = require('../misc/utils/permissions')
const datasetUtils = require('./utils')

const filterFields = {
  concepts: 'schema.x-refersTo',
  'short-concept': 'schema.x-concept.id',
  'field-type': 'schema.type',
  'field-format': 'schema.format',
  children: 'virtual.children',
  services: 'extensions.remoteService',
  status: 'status',
  draftStatus: 'draft.status',
  topics: 'topics.id',
  publicationSites: 'publicationSites',
  requestedPublicationSites: 'requestedPublicationSites',
  spatial: 'spatial',
  keywords: 'keywords',
  title: 'title'
}
const facetFields = {
  ...filterFields,
  topics: 'topics'
}
const sumsFields = { count: 'count' }
const nullFacetFields = ['publicationSites']
const fieldsMap = {
  filename: 'originalFile.name',
  ids: 'id',
  id: 'id',
  slugs: 'slug',
  slug: 'slug',
  rest: 'isRest',
  virtual: 'isVirtual',
  metaOnly: 'isMetaOnly',
  ...filterFields
}

/**
 *
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} publicationSite
 * @param {string} publicBaseUrl
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 */
exports.findDatasets = async (db, locale, publicationSite, publicBaseUrl, reqQuery, user) => {
  const explain = reqQuery.explain === 'true' && user && (user.isAdmin || user.asAdmin) && {}
  const datasets = db.collection('datasets')

  const tolerateStale = !!publicationSite

  /** @type {import('mongodb').AggregateOptions} */
  const options = tolerateStale ? { readPreference: 'nearest' } : {}

  const extraFilters = []
  if (reqQuery.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (reqQuery.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (reqQuery.file === 'true') extraFilters.push({ file: { $exists: true } })

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (publicationSite) {
    extraFilters.push({ 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id })
  }

  const query = findUtils.query(reqQuery, locale, user, 'datasets', fieldsMap, false, extraFilters)
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, [], reqQuery.raw === 'true')
  const [skip, size] = findUtils.pagination(reqQuery)

  const t0 = Date.now()
  const countPromise = reqQuery.count !== 'false' && datasets.countDocuments(query, options).then(res => {
    if (explain) explain.countMS = Date.now() - t0
    return res
  })
  const resultsPromise = size > 0 && datasets.find(query, options).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray().then(res => {
    if (explain) explain.resultsMS = Date.now() - t0
    return res
  })
  const facetsPromise = reqQuery.facets && datasets.aggregate(findUtils.facetsQuery(reqQuery, user, 'datasets', facetFields, filterFields, nullFacetFields, extraFilters), options).toArray().then(res => {
    if (explain) explain.facetsMS = Date.now() - t0
    return res
  })
  const sumsPromise = reqQuery.sums && datasets
    .aggregate(findUtils.sumsQuery(reqQuery, user, 'datasets', sumsFields, filterFields, extraFilters), options).toArray()
    .then(sumsResponse => {
      const res = sumsResponse[0] || {}
      for (const field of reqQuery.sums.split(',')) {
        res[field] = res[field] || 0
      }
      if (explain) explain.sumsMS = Date.now() - t0
      return res
    })
  const [count, results, facets, sums] = await Promise.all([countPromise, resultsPromise, facetsPromise, sumsPromise])
  /** @type {any} */
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)
  if (sumsPromise) response.sums = sums
  const t1 = Date.now()
  for (const r of response.results) {
    if (reqQuery.raw !== 'true') r.userPermissions = permissions.list('datasets', r, user)
    datasetUtils.clean(publicBaseUrl, publicationSite, r, reqQuery)
  }
  if (explain) {
    explain.cleanMS = Date.now() - t1
    response.explain = explain
  }
  return response
}
