// Shared plumbing for handing a raw ES response Buffer to a Piscina render worker with a transferList
// (used by tiles.geojson2pbfFromBuffer and outputs.geojson2shpFromBuffer — keep it in ONE place: the
// pooled-Buffer reasoning and the compileFlatten field contract below are subtle and must not drift).

// Transfer the Buffer's own ArrayBuffer when the Buffer owns it exclusively (Buffer.concat results larger
// than Buffer.poolSize/2 = 4KB are allocated unpooled at offset 0 with an exact-size backing store — the
// common case for real ES responses): zero copies. Small pooled Buffers share their ArrayBuffer with
// unrelated buffers, so transferring it would detach memory we don't own — copy those into a standalone
// ArrayBuffer first. Either way the caller must NOT touch the payload/rawBuffer after piscina.run — the
// transferred ArrayBuffer is detached on this thread.
export const transferableRawBuffer = (rawBuffer: Buffer): { payload: Uint8Array, transferList: ArrayBuffer[] } => {
  if (rawBuffer.buffer instanceof ArrayBuffer && rawBuffer.byteOffset === 0 && rawBuffer.buffer.byteLength === rawBuffer.length) {
    return { payload: rawBuffer, transferList: [rawBuffer.buffer] }
  }
  const standalone = new ArrayBuffer(rawBuffer.length)
  const view = new Uint8Array(standalone)
  view.set(rawBuffer)
  return { payload: view, transferList: [standalone] }
}

// Pass only what getFlatten needs: id/finalizedAt (memoize key) + a minimal schema. compileFlatten reads
// ONLY prop.key and prop.separator, so this keeps the compiled flatten (and thus the worker output)
// identical while avoiding a DataCloneError — the full dataset/schema carries non-cloneable values.
export const slimDatasetForFlatten = (dataset: any) => ({
  id: dataset.id,
  finalizedAt: dataset.finalizedAt,
  schema: (dataset.schema ?? []).map((p: any) => ({ key: p.key, separator: p.separator }))
})
