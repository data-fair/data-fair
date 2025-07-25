import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.js'
import * as permissions from '../misc/utils/permissions.ts'
import mongoEscape from 'mongo-escape'
import { clean } from './utils.js'

const fieldsMap = {
  type: 'type',
  url: 'url',
  organization: 'organization.id',
  ids: 'id',
  id: 'id',
  status: 'status'
}

/**
 * @param {string} locale
 * @param {Record<string, string>} reqQuery
 * @param {SessionState} sessionState
 */
export const findCatalogs = async (locale, reqQuery, sessionState) => {
  const catalogs = mongo.db.collection('catalogs')
  const query = findUtils.query(reqQuery, locale, sessionState, 'catalogs', fieldsMap, false)
  const sort = findUtils.sort(reqQuery.sort)
  const project = findUtils.project(reqQuery.select)
  const [skip, size] = findUtils.pagination(reqQuery)
  const mongoQueries = [
    size > 0 ? catalogs.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    catalogs.countDocuments(query)
  ]
  if (reqQuery.facets) {
    mongoQueries.push(catalogs.aggregate(findUtils.facetsQuery(reqQuery, sessionState, 'catalogs', {}, fieldsMap)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  // @ts-ignore
  for (const r of results) {
    r.userPermissions = permissions.list('catalogs', r, sessionState)
    clean(r, reqQuery.html === 'true')
  }
  facets = findUtils.parseFacets(facets)
  // @ts-ignore
  return { count, results: results.map(result => mongoEscape.unescape(result, true)), facets }
}
