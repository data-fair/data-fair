const findUtils = require('../misc/utils/find')
const { clean, fixConceptsFilters } = require('./utils')
const mongoEscape = require('mongo-escape')

const filterFieldsMap = {
  'input-concepts': 'actions.input.concept',
  'output-concepts': 'actions.output.concept',
  inputCollection: 'actions.inputCollection',
  outputCollection: 'actions.outputCollection',
  'api-id': 'apiDoc.info.x-api-id',
  ids: 'id',
  id: 'id',
  status: 'status'
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
exports.findRemoteServices = async (db, locale, publicationSite, publicBaseUrl, reqQuery, user) => {
  const remoteServices = db.collection('remote-services')
  const extraFilters = []
  if (reqQuery['virtual-datasets'] === 'true' || reqQuery.virtualDatasets === 'true') {
    extraFilters.push({ 'virtualDatasets.active': true })
  }
  if (reqQuery['standard-schema'] === 'true' || reqQuery.standardSchema === 'true') {
    extraFilters.push({ 'standardSchema.active': true })
  }
  await fixConceptsFilters(db, locale, reqQuery, user)
  const query = findUtils.query(reqQuery, locale, user, 'remote-services', filterFieldsMap, true, extraFilters)

  delete reqQuery.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(reqQuery)
  const mongoQueries = [
    size > 0 ? remoteServices.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    remoteServices.countDocuments(query)
  ]
  if (reqQuery.facets) {
    mongoQueries.push(remoteServices.aggregate(findUtils.facetsQuery(reqQuery, user, 'remote-services', {}, filterFieldsMap)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  // @ts-ignore
  for (const r of results) {
    clean(r, user, reqQuery.html === 'true')
  }
  facets = findUtils.parseFacets(facets)
  // @ts-ignore
  return { count, results: results.map(result => mongoEscape.unescape(result, true)), facets }
}

const actionsExtraFilters = [{ 'actions.type': 'http://schema.org/SearchAction' }]

/**
 *
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {any} publicationSite
 * @param {string} publicBaseUrl
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 */
exports.findActions = async (db, locale, publicationSite, publicBaseUrl, reqQuery, user) => {
  await fixConceptsFilters(db, locale, reqQuery, user)
  const query = findUtils.query(reqQuery, locale, user, 'remote-services', filterFieldsMap, true, actionsExtraFilters)

  delete reqQuery.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(reqQuery)

  /* const countPipeline = [
    { $match: query }, // filter before the unwind for performance
    { $project: { _id: 0, 'actions.id': 1 } },
    { $unwind: '$actions' },
    { $match: query }, // filter after the unwind to select individual actions
    { $count: 'count' }
  ]
  const countRes = await req.app.get('db').collection('remote-services').aggregate(countPipeline).toArray()
  console.log('countRes', countRes) */

  const actionsQuery = { ...query }
  delete actionsQuery.$text

  /** @type {any[]} */
  const pipeline = [
    { $match: query }, // filter before the unwind for performance
    { $unwind: '$actions' },
    { $match: actionsQuery }, // filter after the unwind to select individual actions
    { $project: project }
  ]
  if (Object.keys(sort).length) pipeline.push({ $sort: sort })
  pipeline.push({ $skip: skip })
  pipeline.push({ $limit: size })

  const aggRes = await db.collection('remote-services').aggregate(pipeline).toArray()
  const results = aggRes.map(remoteService => {
    /** @type {any} */
    const result = {
      id: `${remoteService.id}--${remoteService.actions.id}`,
      title: remoteService.actions.summary,
      action: remoteService.actions
    }
    delete remoteService.actions
    result.remoteService = remoteService
    return result
  })
  return { results }
}
