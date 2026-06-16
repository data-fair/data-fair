import { aliasName, prepareQuery } from './commons.ts'
import { timedEsCall } from './abort.ts'

/** @param {import('./abort.ts').EsAbortContext} [abortContext] */
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
