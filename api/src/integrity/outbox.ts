import mongo from '#mongo'

export { stampHistorize } from './operations.ts'

// Second-pass stamp for bulk propagation writers (topics rename, identity rename, settings
// cleanups): their updateMany cannot carry a per-doc conditional stamp, so stamp the affected
// integrity-active datasets right after. Not single-doc atomic with the propagation write — a
// crash between the two surfaces as a loud false breach at the next check, reconciled by _fix
// (the accepted fail-loud posture, spec §4). Over-stamping is harmless: the relay dedupes, and
// drops the flag entirely on datasets whose integrity is not active.
export const stampHistorizeMany = async (filter: Record<string, any>): Promise<void> => {
  await mongo.datasets.updateMany(
    { ...filter, 'integrity.active': true },
    { $addToSet: { '_needsHistorizing.classes': 'metadata' } }
  )
}
