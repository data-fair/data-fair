import { type AccountKeys } from '@data-fair/lib-express'

const matchOwner = (o1: AccountKeys, o2: AccountKeys) => o1.type === o2.type && o1.id === o2.id

/**
 * Decide which owners must be excluded from grabbing a new slot on a worker,
 * to enforce fair allocation between accounts.
 *
 * `concurrencyLimitPerAccount` is the fraction (0-1) of a worker's slots a single
 * owner may use concurrently. At 1 (the default) the rules below are disabled and a
 * single owner can use every slot, which suits small mono-organization deployments.
 * Lower it (e.g. 0.5) on shared multi-organization deployments to keep an owner from
 * monopolizing the workers.
 *
 * Pure function (no side effects, no module state) so it can be unit tested directly.
 */
export const computeExcludedOwners = (
  maxConcurrency: number,
  pending: { owner: AccountKeys }[],
  concurrencyLimitPerAccount: number
): AccountKeys[] => {
  const excludedOwners: AccountKeys[] = []
  if (maxConcurrency >= 2 && concurrencyLimitPerAccount < 1) {
    // 1rst rule: prevent a owner from using more than their share of the available slots
    const maxOwnerConcurrency = Math.floor(maxConcurrency * concurrencyLimitPerAccount)
    for (const task of pending) {
      if (!excludedOwners.some(o => matchOwner(o, task.owner))) {
        const nbOwnerTasks = pending.filter(t => matchOwner(t.owner, task.owner)).length
        if (nbOwnerTasks >= maxOwnerConcurrency) {
          excludedOwners.push(task.owner)
        }
      }
    }
    // 2nd rule: prevent a owner who already has a running task from using the last slot
    if (pending.length >= maxConcurrency - 1) {
      for (const task of pending) {
        if (!excludedOwners.some(o => matchOwner(o, task.owner))) {
          excludedOwners.push(task.owner)
        }
      }
    }
  }
  return excludedOwners
}
