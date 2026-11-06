import type { SessionState } from '@data-fair/lib-express'
import { getAccountRole } from '@data-fair/lib-express'

/** Marker of a dataset or application placed in the bin. `cascade` is set on a fragment shelved because of its parent. */
export type Shelved = { at: string, by: { id: string, name: string }, cascade?: true, purging?: string }

/** Mongo filters selecting the live resources / the resources in the bin. */
export const notShelved = Object.freeze({ shelved: Object.freeze({ $exists: false }) }) as { shelved: { $exists: false } }
export const onlyShelved = Object.freeze({ shelved: Object.freeze({ $exists: true }) }) as { shelved: { $exists: true } }

/**
 * Worker tasks that keep running on shelved resources: the integrity outbox must drain, or the
 * checker raises integrity-check-stale for a dataset that merely sits in the bin. Every other task
 * ignores shelved resources.
 */
export const binAllowedTasks: Record<'datasets' | 'applications', string[]> = { datasets: ['historize', 'historizeLines'], applications: [] }

/** A purge claim older than this is from a crashed purge: the item can be claimed again. */
export const PURGE_CLAIM_STALE_MS = 3600000

/** Whether a `shelved.purging` claim is held by a purge that may still be running. */
export const isPurgeClaimFresh = (purging: string | undefined, now: Date): boolean =>
  !!purging && new Date(purging).getTime() > now.getTime() - PURGE_CLAIM_STALE_MS

/** Mongo filter of the shelved items a purge may claim: no claim, or a stale one. */
export const purgeClaimableFilter = (now: Date) => ({
  $or: [
    { 'shelved.purging': { $exists: false } },
    { 'shelved.purging': { $lte: new Date(now.getTime() - PURGE_CLAIM_STALE_MS).toISOString() } }
  ]
})

/** Whether an item shelved at shelvedAt is past its retention (purged from the first instant of the day retentionDays later). */
export const isShelvedExpired = (shelvedAt: string, retentionDays: number, now: Date): boolean =>
  new Date(shelvedAt).getTime() + retentionDays * 86400000 <= now.getTime()

/** Whether a shelved item is purged under the owner's current bin settings: the bin is off, or the item is past retention. */
export const shouldPurge = (settings: { active: boolean, retentionDays: number }, shelvedAt: string, now: Date): boolean =>
  !settings.active || isShelvedExpired(shelvedAt, settings.retentionDays, now)

type OwnerLike = { type: string, id: string, department?: string }

/**
 * Whether the session can see the bin of the item's owner: org admin on the root account,
 * or department admin of the item's department. Pure: the admin role is a parameter.
 */
export const canSeeBin = (sessionState: SessionState, owner: OwnerLike, adminRole: string): boolean => {
  const role = getAccountRole(sessionState, { type: owner.type as 'user' | 'organization', id: owner.id, department: owner.department })
  if (role === null) return false
  if (sessionState.user?.adminMode) return true
  return role === adminRole
}

/** Owner filter for the bin listing: the whole organization for a root account, one department otherwise. */
export const binAudienceFilter = (account: OwnerLike): Record<string, any> => {
  const filter: Record<string, any> = { 'owner.type': account.type, 'owner.id': account.id }
  if (account.department) filter['owner.department'] = account.department
  return filter
}
