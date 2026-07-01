export interface LinesSource { total: number | undefined, hits: AsyncIterable<any>, tail(): Promise<any> }

export function bufferedSource (esResponse: any): LinesSource {
  return {
    total: esResponse.hits.total?.value,
    hits: (async function * () { for (const h of esResponse.hits.hits) yield h })(),
    tail: async () => esResponse
  }
}
