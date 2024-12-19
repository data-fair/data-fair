
import { aliasName, prepareQuery } from './commons.js'

export default async (client, dataset, query) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await client.count({ index: aliasName(dataset), body: { query: esQuery.query } })
  return esResponse.body.count
}
