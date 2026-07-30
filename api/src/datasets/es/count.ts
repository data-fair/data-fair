import { aliasName, prepareQuery } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import es from '#es'

export default async (dataset: any, query: Record<string, any>, abortContext?: EsAbortContext) => {
  const esQuery = prepareQuery(dataset, query)
  const esResponse = await timedEsCall(abortContext, () => es.client.count({ index: aliasName(dataset), body: { query: esQuery.query } }, abortContext))
  return esResponse.count
}
