import mongo from '#mongo'

export { stampHistorize } from './operations.ts'

// Second-pass stamp for bulk propagation writers that make GENUINE covered-content changes
// (permission-entry removal on identity deletion, topic deletion $pull, customMetadata cleanup,
// publicationSite deletion $pull) — their updateMany cannot carry a per-doc conditional stamp,
// so stamp the affected integrity-active datasets separately. Not single-doc atomic with the
// propagation write — a crash between the two surfaces as a loud false breach at the next check,
// reconciled by _fix (the accepted fail-loud posture). Call it BEFORE a destructive write whose
// filter self-invalidates ($pull/$unset removing the matched field). Over-stamping is harmless:
// the relay dedupes, and drops the flag on datasets whose integrity is not active.
export const stampHistorizeMany = async (filter: Record<string, any>): Promise<void> => {
  await mongo.datasets.updateMany(
    { ...filter, 'integrity.active': true },
    { $set: { _needsHistorizing: { context: { operation: 'update', origin: 'propagation' } } } }
  )
}
