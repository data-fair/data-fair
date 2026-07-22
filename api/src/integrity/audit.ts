// Daily store-vs-Mongo scope audit (round 3, design §S2): the sweep's worklist and the purge's
// carve-out are driven by Mongo's `integrity.active` — attacker territory. The store is the
// authority: a scope whose latest revision is a live (non-terminal) anchor under unexpired
// protection, while Mongo claims the dataset inactive or gone, is the signature of an
// out-of-band disarm ("kill the alarm first"). Legitimate disable/delete end the trail with a
// terminal revision (service.ts / datasets delete path), so they classify clean.
import config from '#config'
import mongo from '#mongo'
import Debug from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { IntegrityStore } from './store.ts'
import * as ops from './operations.ts'
import { maybeAlert } from './alerts.ts'
import * as notifications from '../misc/utils/notifications.ts'

const debug = Debug('integrity-audit')

const TERMINAL_OPERATIONS = new Set(['disable', 'delete'])

export type IncoherentScope = {
  scopePrefix: string
  datasetId: string
  reason: 'out-of-band-disarm' | 'reclaimed-markers'
  detail?: string
}

export type AuditResult = { scopes: number, incoherent: IncoherentScope[] }

// `reclaimedMarkers` comes from the purge run of the same daily pass: markers are attacker
// artifacts (no code path of ours issues a versionless DELETE), so their reclaim is reported
// through the same event instead of being silently swept.
export const auditScopes = async (store: IntegrityStore, opts?: { reclaimedMarkers?: Record<string, number> }): Promise<AuditResult> => {
  const retentionMs = (config.integrity?.retention?.days ?? 365) * 24 * 3600 * 1000
  const now = Date.now()
  const result: AuditResult = { scopes: 0, incoherent: [] }

  for (const ownerPrefix of await store.listSubPrefixes(ops.SERVICE_PREFIX)) {
    const owner = ops.parseOwnerPrefix(ownerPrefix)
    if (!owner) continue
    for (const scopePrefix of await store.listSubPrefixes(ownerPrefix)) {
      result.scopes++
      const datasetId = scopePrefix.split('/')[2]
      if (!datasetId) continue
      try {
        const dataset = await mongo.datasets.findOne({ id: datasetId }, { projection: { id: 1, slug: 1, title: 1, owner: 1, integrity: 1 } })
        if (dataset?.integrity?.active) continue // protection armed: coherent (checkDataset owns the rest)

        // Mongo says inactive or gone: coherent only if the trail ends with a terminal revision
        // or nothing under it is protected anymore (aging out normally)
        const revisions = (await store.listRevisions(scopePrefix, { delimiter: '/' }))
          .filter((r) => !ops.isSiblingKey(r.key))
        const latest = revisions.length ? revisions.reduce((a, b) => (a.key > b.key ? a : b)) : undefined
        if (!latest) continue
        // age is a sound lower bound (a lock is never earlier than lastModified + retention);
        // an older object may still be renewal-extended — only then pay the HEAD
        let protectedUntil = latest.lastModified ? latest.lastModified.getTime() + retentionMs : 0
        if (protectedUntil <= now) {
          const retainUntil = await store.getRetention(latest.key)
          protectedUntil = retainUntil?.getTime() ?? 0
        }
        if (protectedUntil <= now) continue // nothing protected: normal aging-out tail
        const latestRevision = await store.getRevision(latest.key)
        if (TERMINAL_OPERATIONS.has(latestRevision.context.operation)) continue // signed-off end

        const incoherent: IncoherentScope = {
          scopePrefix,
          datasetId,
          reason: 'out-of-band-disarm',
          detail: `latest revision ${latest.key} (${latestRevision.context.operation}) is protected until ${new Date(protectedUntil).toISOString()} but integrity is not active in the database`
        }
        result.incoherent.push(incoherent)
        if (dataset) {
          // existing doc: entry-alert + realert cadence through the shared dedup map (§S3)
          await maybeAlert(dataset as any, 'integrity-scope-incoherent', true)
        } else {
          // deleted dataset: no doc to hold dedup state — rebuild a minimal resource from the
          // trail's own denormalized descriptor and alert on every audit pass (deliberately
          // loud: a protected scope with no dataset and no terminal revision is the worst case)
          const resource: any = {
            id: datasetId,
            slug: latestRevision.dataset.slug,
            title: latestRevision.dataset.slug ?? datasetId,
            owner
          }
          await notifications.sendResourceEvent('datasets', resource, 'worker:integrity-audit', 'integrity-scope-incoherent')
        }
      } catch (err) {
        internalError('integrity-audit-scope', err)
      }
    }
  }

  for (const [scopePrefix, count] of Object.entries(opts?.reclaimedMarkers ?? {})) {
    const datasetId = scopePrefix.split('/')[2]
    if (!datasetId || !count) continue
    const incoherent: IncoherentScope = { scopePrefix, datasetId, reason: 'reclaimed-markers', detail: `${count} delete marker(s) reclaimed by the purge` }
    result.incoherent.push(incoherent)
    try {
      const dataset = await mongo.datasets.findOne({ id: datasetId }, { projection: { id: 1, slug: 1, title: 1, owner: 1 } })
      const owner = ops.parseOwnerPrefix(scopePrefix.split('/').slice(0, 2).join('/') + '/')
      const resource: any = dataset ?? { id: datasetId, slug: datasetId, title: datasetId, owner }
      await notifications.sendResourceEvent('datasets', resource, 'worker:integrity-audit', 'integrity-scope-incoherent')
    } catch (err) {
      internalError('integrity-audit-markers', err)
    }
  }

  debug('audited scopes', result.scopes, 'incoherent', result.incoherent.length)
  return result
}
