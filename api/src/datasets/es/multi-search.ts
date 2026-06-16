import { aliasName, prepareQuery } from './commons.ts'
import { type EsAbortContext, timedEsCall } from './abort.ts'
import { type Client } from '@elastic/elasticsearch'

export default async (client: Client, dataset: any, queries: Record<string, any>[], abortContext?: EsAbortContext) => {
  const body: any[] = []
  for (const query of queries) {
    body.push({ index: aliasName(dataset) })
    body.push(prepareQuery(dataset, query))
  }

  const esResponse = await timedEsCall(abortContext, () => client.msearch({ body }, abortContext))

  return esResponse
}
