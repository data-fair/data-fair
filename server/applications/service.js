const findUtils = require('../misc/utils/find')
const permissions = require('../misc/utils/permissions')
const { clean } = require('./utils')
const config = /** @type {any} */(require('config'))

const filterFields = {
  url: 'url',
  'base-application': 'url',
  dataset: 'configuration.datasets.href',
  topics: 'topics.id',
  publicationSites: 'publicationSites',
  requestedPublicationSites: 'requestedPublicationSites'
}
const facetFields = {
  ...filterFields,
  topics: 'topics'
}
const nullFacetFields = ['publicationSites']
const fieldsMap = {
  ids: 'id',
  id: 'id',
  status: 'status',
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
exports.findApplications = async (db, locale, publicationSite, publicBaseUrl, reqQuery, user) => {
  const applications = db.collection('applications')

  const tolerateStale = !!publicationSite

  /** @type {import('mongodb').FindOptions} */
  const options = tolerateStale ? { readPreference: 'nearest' } : {}

  if (reqQuery.dataset &&
      !reqQuery.dataset.startsWith('http://') &&
      !reqQuery.dataset.startsWith('https://')) {
    reqQuery.dataset = config.publicUrl + '/api/v1/datasets/' + reqQuery.dataset
  }
  if (reqQuery.service &&
      !reqQuery.service.startsWith('http://') &&
      !reqQuery.service.startsWith('https://')) {
    reqQuery.service = config.publicUrl + '/api/v1/remote-services/' + reqQuery.service
  }

  const extraFilters = []

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (publicationSite) {
    extraFilters.push({ 'owner.type': publicationSite.owner.type, 'owner.id': publicationSite.owner.id })
  }

  if (reqQuery.filterConcepts === 'true') {
    extraFilters.push({ 'baseApp.meta.df:filter-concepts': 'true' })
  }
  if (reqQuery.syncState === 'true') {
    extraFilters.push({ 'baseApp.meta.df:sync-state': 'true' })
  }
  if (reqQuery.overflow === 'true') {
    extraFilters.push({ 'baseApp.meta.df:overflow': 'true' })
  }

  const query = findUtils.query(reqQuery, locale, user, 'applications', fieldsMap, false, extraFilters)

  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, ['configuration', 'configurationDraft'], reqQuery.raw === 'true')
  const [skip, size] = findUtils.pagination(reqQuery)

  const countPromise = reqQuery.count !== 'false' && applications.countDocuments(query, options)
  const resultsPromise = size > 0 && applications.find(query, options).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray()
  const facetsPromise = reqQuery.facets && applications.aggregate(findUtils.facetsQuery(reqQuery, user, 'applications', facetFields, filterFields, nullFacetFields), options).toArray()
  const [count, results, facets] = await Promise.all([countPromise, resultsPromise, facetsPromise])
  /** @type {any} */
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)

  for (const r of response.results) {
    if (reqQuery.raw !== 'true') r.userPermissions = permissions.list('applications', r, user)
    clean(r, publicBaseUrl, publicationSite, reqQuery)
  }

  return response
}
