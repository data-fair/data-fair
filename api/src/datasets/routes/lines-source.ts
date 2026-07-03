// `hits` yields BULKS (arrays of hits), not individual hits — consumers iterate each bulk synchronously.
// This mirrors the codebase's `iterHits` pattern and avoids one async-generator step (promise + microtask)
// per hit: for a large page that is thousands of awaits saved. The streamed source's bulk is one ~20KB
// parse batch; the buffered source yields its whole array as a single bulk. `total` is NOT exposed up
// front: the body is assembled before res.send, so consumers read it from the tail envelope
// (`tail().hits.total?.value`) once the hits are drained — this is what lets the streamed source stay
// fully incremental even when ES omits hits.total (track_total_hits:false on after= pages / count=false).
// `destroy` (streamed source only) releases the underlying ES response stream — called by the pipeline
// when an error unwinds before the hits are drained, so the transport connection isn't left pinned.
export interface LinesSource { hits: AsyncIterable<any[]>, tail(): Promise<any>, destroy?: () => void }

export function bufferedSource (esResponse: any): LinesSource {
  return {
    hits: (async function * () { if (esResponse.hits.hits.length) yield esResponse.hits.hits })(),
    tail: async () => esResponse
  }
}
