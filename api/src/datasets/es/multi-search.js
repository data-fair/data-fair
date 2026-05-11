import { aliasName, prepareQuery } from './commons.js'

/** @param {import('./abort.js').EsAbortContext} [abortContext] */
export default async (client, dataset, queries, abortContext) => {
  const body = []
  for (const query of queries) {
    body.push({ index: aliasName(dataset) })
    body.push(prepareQuery(dataset, query))
  }

  const esResponse = await client.msearch({ body }, abortContext)

  return esResponse
}
