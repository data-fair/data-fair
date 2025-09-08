import { aliasName, prepareQuery } from './commons.js'
import es from '#es'

export default async (dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await es.client.count({ index: aliasName(dataset), body: { query: esQuery.query } })
  return esResponse.count
}
