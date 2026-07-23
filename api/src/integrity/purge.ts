// Purge of expired revisions (architecture §3.5/§8: "older revisions age out at retention").
// A stored-but-no-longer-locked revision grounds no guarantee — it could have been altered — so it
// brings no value and only grows the store and the checker's LIST: delete it.
//
// Shape: **list object versions, filter by time, delete what has lapsed** — the same model as the
// `mc rm --versions --older-than` cleanup cronjobs on our backup buckets. Deletion is decided from
// dates and only then executed, so **an S3 error is a real error**, never control flow: the purge
// never attempts a delete to learn whether an object is still locked.
//
// **Not listing what cannot have expired.** S3 LIST has no date predicate (only prefix / delimiter
// / marker / max-keys), so age can never be pushed server-side — `mc --older-than` walks
// everything too. What we can do is not ask for the objects at all: the store is laid out
// `data-fair/‹owner›/‹datasetId›/…`, so a `Delimiter: '/'` listing enumerates dataset scopes at
// O(datasets) cost, and each scope carries a **watermark** — the earliest date at which anything
// under it could next become deletable. Below that date the whole subtree is skipped with zero
// object listing. The watermark is derived, never guessed: after a pass at T it is the min of
// every kept-but-unexpired version's `lastModified + retention` and `T + retention` (nothing
// written after T can expire sooner than that). Scopes are discovered from S3, not from Mongo, so
// the tail of a *deleted* dataset still ages out (§8) instead of being orphaned forever.
//
// **Retention is per-key, not per-scope** (T5): the `.who` attribution sibling carries its OWN,
// shorter retention (config `integrity.attribution.retentionDays`), distinct from the revision's
// own (config `integrity.retention.days`) — see `WhoBody`/`whoKey` in operations.ts and
// README.md invariant 15. Both the age pre-filter and the "T + retention" watermark term above
// use `ops.retentionMsFor(key, …)` / `ops.scopeWatermarkFloor(…)`, never a single global window —
// otherwise a lapsed `.who` would stay "provably young" until the (longer) revision horizon,
// silently keeping it around past its own shorter, GDPR-bounded promise.
//
// **Why a post-list check is still needed** (the "delayed locks"): unlike a backup bucket, locks
// here get *extended* — renewal slides the current anchor (§3.4) and a revision referencing an
// earlier payload extends that payload at write time (§3.5). So object age is only a *lower* bound
// on the protection horizon. It is used exactly that way — a sound filter that can only skip work,
// never authorize a delete — and the version's actual `ObjectLockRetainUntilDate` is what decides.
import mongo from '#mongo'
import config from '#config'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { IntegrityStore } from './store.ts'
import * as ops from './operations.ts'
import { DELETED_MARKER } from './lines-operations.ts'

const CONCURRENCY = 50
const SERVICE_PREFIX = ops.SERVICE_PREFIX
// only act on locks that lapsed comfortably in the past: our clock and the provider's are not the
// same clock, and a delete refused right at the boundary would be a spurious error
const CLOCK_SKEW_MARGIN_MS = 60 * 1000

const watermarks = () => mongo.db.collection<{ _id: string, nextEligible: Date }>('integrity-purge')

/** Forget a scope's watermark so its next purge pass re-examines it immediately. Called when
 * integrity is disabled: the dataset's anchors stop being protected at that moment and must be
 * allowed to age out without waiting for a watermark computed while they still were. */
export const resetPurgeWatermark = async (owner: { type: string, id: string }, datasetId: string): Promise<void> => {
  await watermarks().deleteOne({ _id: ops.revisionPrefix(owner, datasetId) })
}

// markerScopes: delete markers reclaimed per dataset scope — markers are attacker artifacts
// (no code path of ours issues a versionless DELETE), so the daily audit reports their reclaim
// (integrity-scope-incoherent) instead of this purge silently destroying the anomaly evidence
export type PurgeResult = { deleted: number, kept: number, errors: number, scopes: number, skipped: number, markerScopes: Record<string, number> }

type StoredVersion = { key: string, versionId?: string, isLatest?: boolean, lastModified?: Date, deleteMarker?: boolean }

// …/‹dsId›/‹paddedI›[.file] → the dataset-level sequence; …/‹dsId›/lines/‹lineId›/‹name› → that
// line's sequence; anything else is a singleton group (no protection, the dates decide)
const sequenceId = (key: string): string => {
  const parts = key.split('/')
  if (parts.length >= 6 && parts[3] === 'lines') return parts.slice(0, 5).join('/') + '/'
  if (parts.length === 4) return parts.slice(0, 3).join('/') + '/'
  return key
}

export const purgeExpiredRevisions = async (
  store: IntegrityStore,
  opts?: { prefix?: string, ignoreAge?: boolean, skewMarginMs?: number, ignoreWatermark?: boolean }
): Promise<PurgeResult> => {
  const retentionMs = (config.integrity?.retention?.days ?? 365) * 24 * 3600 * 1000
  // the `.who` attribution sibling's OWN (shorter) window (T5): threaded into both the age
  // pre-filter and the scope watermark floor below via ops.retentionMsFor/ops.scopeWatermarkFloor —
  // a single global retentionMs would keep a lapsed `.who` "provably young" until the revision's
  // (longer) horizon, silently breaking its shorter GDPR-bounded promise.
  const attributionRetentionMs = (config.integrity?.attribution?.retentionDays ?? 180) * 24 * 3600 * 1000
  const skewMarginMs = opts?.skewMarginMs ?? CLOCK_SKEW_MARGIN_MS
  const now = Date.now()
  const result: PurgeResult = { deleted: 0, kept: 0, errors: 0, scopes: 0, skipped: 0, markerScopes: {} }

  // sequences arrive contiguous (lexical LIST order), so a single-entry cache suffices
  let cachedActive: { datasetId: string, active: boolean } | undefined
  const datasetActive = async (datasetId: string): Promise<boolean> => {
    if (cachedActive?.datasetId !== datasetId) {
      const dataset = await mongo.datasets.findOne({ id: datasetId }, { projection: { integrity: 1 } })
      cachedActive = { datasetId, active: !!dataset?.integrity?.active }
    }
    return cachedActive.active
  }

  // The current anchor set of a still-enrolled dataset is kept whatever its lock says. This is not
  // a guess about the lock but a refusal to act on a lapsed one: under a renewal outage — already
  // surfaced loudly by lastRenewal / linesRenewal (§3.4) — deleting the anchor would manufacture a
  // missing-anchor breach and destroy repairability irreversibly, while keeping a stale-locked
  // anchor costs only storage. Protected objects are excluded from the watermark below, or they
  // would pin it to the past forever and defeat the skipping.
  const protectedKeys = async (group: StoredVersion[], seqId: string): Promise<Set<string>> => {
    const protectedSet = new Set<string>()
    const parts = seqId.split('/')
    const datasetId = parts[2]
    if (!datasetId || !(await datasetActive(datasetId))) return protectedSet
    if (parts[3] === 'lines') {
      // explicit sibling exclusion: a `.who` key is a strict string extension of its own revision
      // key (‹i›-‹sha›.who), so it sorts lexically AFTER it — without filtering it out here it
      // could itself be picked as "latest" and wrongly protected, while the real revision key it
      // shadows would NOT be in protectedSet and could be purged out from under it
      const revKeys = [...new Set(group.filter((v) => !v.deleteMarker && !ops.isSiblingKey(v.key)).map((v) => v.key))].sort()
      const latest = revKeys.at(-1)
      // a tombstone latest is deliberately NOT protected: a deleted line's history ages out whole
      if (latest && !latest.endsWith(`-${DELETED_MARKER}`)) protectedSet.add(latest)
    } else {
      const revKeys = [...new Set(group.filter((v) => !v.deleteMarker && !ops.isSiblingKey(v.key)).map((v) => v.key))].sort()
      const latest = revKeys.at(-1)
      if (latest) {
        protectedSet.add(latest)
        // the anchor is a revision PAIR: also protect the .file payload it references, which under
        // payload reference dedupe may be an earlier revision's copy (resolve file.i, absent = own)
        try {
          const rev = await store.getRevision(latest)
          if (rev.payload?.file) {
            const refIndex = rev.payload.file.i ?? ops.parseRevisionIndex(latest)
            protectedSet.add(`${seqId}${ops.padIndex(refIndex)}${ops.PAYLOAD_SUFFIX}`)
          }
        } catch (err) {
          // unreadable latest revision: protect it alone, surface the anomaly
          internalError('integrity-purge-protect', err)
        }
      }
    }
    return protectedSet
  }

  // Has this version's protection horizon genuinely passed? Delete markers carry no lock and are
  // always reclaimable; everything else is judged on its real retain-until, read from the store.
  const hasLapsed = async (v: StoredVersion): Promise<boolean> => {
    if (v.deleteMarker) return true
    const retainUntil = await store.getRetention(v.key, v.versionId)
    if (!retainUntil) return true // no lock on this version: nothing protects it
    return retainUntil.getTime() <= now - skewMarginMs
  }

  // Purge one dataset scope. Returns the scope's next watermark: nothing under it can become
  // deletable before then, so the next pass may skip it without listing a single object.
  const purgeScope = async (scopePrefix: string): Promise<Date> => {
    result.scopes++
    // any object written from now on expires no sooner than this — the floor for a scope that
    // ends up holding nothing purgeable. A `.who` written after this pass ages out at the
    // (shorter) attribution window, so the floor must use the shorter of the two windows.
    let nextEligible = ops.scopeWatermarkFloor(now, retentionMs, attributionRetentionMs)

    const flush = async (group: StoredVersion[], seqId: string): Promise<void> => {
      const protectedSet = await protectedKeys(group, seqId)
      const candidates: StoredVersion[] = []
      for (const v of group) {
        if (v.isLatest && protectedSet.has(v.key)) { result.kept++; continue }
        // per-key window: a `.who` sibling's own (shorter) attribution retention, the revision's
        // full retention otherwise (T5) — see ops.retentionMsFor
        const keyRetentionMs = ops.retentionMsFor(v.key, retentionMs, attributionRetentionMs)
        // sound pre-filter: a lock is never earlier than lastModified + retention, so a young
        // object is provably still protected and needs no round-trip to rule out
        if (!opts?.ignoreAge && !v.deleteMarker && v.lastModified && v.lastModified.getTime() + keyRetentionMs > now) {
          result.kept++
          nextEligible = Math.min(nextEligible, v.lastModified.getTime() + keyRetentionMs)
          continue
        }
        candidates.push(v)
      }
      for (let offset = 0; offset < candidates.length; offset += CONCURRENCY) {
        await Promise.all(candidates.slice(offset, offset + CONCURRENCY).map(async (v) => {
          try {
            if (!(await hasLapsed(v))) {
              // an extended lock (renewal / payload reference): older than the age filter suggests
              // but genuinely still protected — it sets the watermark from its real horizon
              result.kept++
              const retainUntil = await store.getRetention(v.key, v.versionId)
              if (retainUntil) nextEligible = Math.min(nextEligible, retainUntil.getTime())
              return
            }
            await store.deleteVersion(v.key, v.versionId)
            result.deleted++
            if (v.deleteMarker) result.markerScopes[scopePrefix] = (result.markerScopes[scopePrefix] ?? 0) + 1
          } catch (err) {
            // no error is expected here: the decision was taken on dates, so a failure means
            // something genuinely went wrong (or our view of the lock diverged from the store)
            result.errors++
            internalError('integrity-purge', err)
          }
        }))
      }
    }

    let group: StoredVersion[] = []
    let groupId: string | undefined
    for await (const page of store.iterateVersionPages(scopePrefix)) {
      for (const version of page) {
        const seqId = sequenceId(version.key)
        if (seqId !== groupId) {
          if (group.length && groupId !== undefined) await flush(group, groupId)
          group = []
          groupId = seqId
        }
        group.push(version)
      }
    }
    if (group.length && groupId !== undefined) await flush(group, groupId)
    return new Date(nextEligible)
  }

  // one explicit scope (manual / targeted run), or every dataset scope discovered from the store
  let scopePrefixes: string[]
  if (opts?.prefix) {
    scopePrefixes = [opts.prefix]
  } else {
    scopePrefixes = []
    for (const ownerPrefix of await store.listSubPrefixes(SERVICE_PREFIX)) {
      scopePrefixes.push(...await store.listSubPrefixes(ownerPrefix))
    }
  }

  for (const scopePrefix of scopePrefixes) {
    if (!opts?.ignoreWatermark) {
      const watermark = await watermarks().findOne({ _id: scopePrefix })
      if (watermark && watermark.nextEligible.getTime() > now) { result.skipped++; continue }
    }
    const nextEligible = await purgeScope(scopePrefix)
    await watermarks().updateOne({ _id: scopePrefix }, { $set: { nextEligible } }, { upsert: true })
  }
  return result
}
