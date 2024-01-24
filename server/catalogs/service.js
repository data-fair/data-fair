const findUtils = require('../misc/utils/find')
const permissions = require('../misc/utils/permissions')
const mongoEscape = require('mongo-escape')
const { clean } = require('./utils')

const fieldsMap = {
  type: 'type',
  url: 'url',
  organization: 'organization.id',
  ids: 'id',
  id: 'id',
  status: 'status'
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} locale
 * @param {Record<string, string>} reqQuery
 * @param {any} user
 */
exports.findCatalogs = async (db, locale, reqQuery, user) => {
  const catalogs = db.collection('catalogs')
  const query = findUtils.query(reqQuery, locale, user, 'catalogs', fieldsMap, false)
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select)
  const [skip, size] = findUtils.pagination(reqQuery)
  const mongoQueries = [
    size > 0 ? catalogs.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    catalogs.countDocuments(query)
  ]
  if (reqQuery.facets) {
    mongoQueries.push(catalogs.aggregate(findUtils.facetsQuery(reqQuery, user, 'catalogs', {}, fieldsMap)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  // @ts-ignore
  for (const r of results) {
    r.userPermissions = permissions.list('catalogs', r, user)
    clean(r, reqQuery.html === 'true')
  }
  facets = findUtils.parseFacets(facets)
  // @ts-ignore
  return { count, results: results.map(result => mongoEscape.unescape(result, true)), facets }
}
