import { aliasName, prepareQuery } from './commons.js'
import { timedEsCall } from './abort.js'

/** @param {import('./abort.js').EsAbortContext} [abortContext] */
export default async (client, dataset, queries, abortContext) => {
  /** @type {any[]} */
  const body = []
  for (const query of queries) {
    body.push({ index: aliasName(dataset) })
    body.push(prepareQuery(dataset, query))
  }

  const esResponse = await timedEsCall(abortContext, () => client.msearch({ body }, abortContext))

  return esResponse
}
