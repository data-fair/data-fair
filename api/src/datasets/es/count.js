import { aliasName, prepareQuery } from './commons.js'
import { timedEsCall } from './abort.js'
import es from '#es'

/** @param {import('./abort.js').EsAbortContext} [abortContext] */
export default async (dataset, query, abortContext) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await timedEsCall(abortContext, () => es.client.count({ index: aliasName(dataset), body: { query: esQuery.query } }, abortContext))
  return esResponse.count
}
