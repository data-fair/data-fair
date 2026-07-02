// `hits` yields BULKS (arrays of hits), not individual hits — consumers iterate each bulk synchronously.
// This mirrors the codebase's `iterHits` pattern and avoids one async-generator step (promise + microtask)
// per hit: for a large page that is thousands of awaits saved. The streamed source's bulk is one ~20KB
// parse batch; the buffered source yields its whole array as a single bulk.
export interface LinesSource { total: number | undefined, hits: AsyncIterable<any[]>, tail(): Promise<any> }

export function bufferedSource (esResponse: any): LinesSource {
  return {
    total: esResponse.hits.total?.value,
    hits: (async function * () { if (esResponse.hits.hits.length) yield esResponse.hits.hits })(),
    tail: async () => esResponse
  }
}
