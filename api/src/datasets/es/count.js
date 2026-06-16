import { aliasName, prepareQuery } from './commons.ts'
import { timedEsCall } from './abort.ts'
import es from '#es'

/** @param {import('./abort.ts').EsAbortContext} [abortContext] */
export default async (dataset, query, abortContext) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await timedEsCall(abortContext, () => es.client.count({ index: aliasName(dataset), body: { query: esQuery.query } }, abortContext))
  return esResponse.count
}
