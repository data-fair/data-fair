import dayjs from 'dayjs'

export type Milestone = 'expiring' | 'expired'
export type FlagField = 'notifiedJ3At' | 'notifiedJAt'

// which dedup flag guards which milestone
export const milestoneFlag: Record<Milestone, FlagField> = {
  expiring: 'notifiedJ3At',
  expired: 'notifiedJAt'
}

/**
 * Decide which expiration mails are due for an api key on day `now` (YYYY-MM-DD).
 * Pure: no DB, no mail, no clock. `expireAt` is a YYYY-MM-DD string; lexical
 * comparison on that format is chronological.
 *
 * - 'expiring' : strictly in the future, within 3 days (today < expireAt <= today+3)
 * - 'expired'  : the expiry day or later (expireAt <= today)
 *   Note: 'expired' fires on the expiry day itself (expireAt <= now), deliberately superseding
 *   the previous worker behaviour that announced expiry only the day after; the day-of mail uses
 *   forward-looking wording ("arrive à expiration"), so this is correct.
 *
 * Anti-spam: a key expiring today yields only 'expired' (never 'expiring').
 */
export const computeDueMilestones = (
  apiKey: { expireAt?: string, notifiedJ3At?: string, notifiedJAt?: string },
  now: string
): Milestone[] => {
  if (!apiKey.expireAt) return []
  const j3 = dayjs(now).add(3, 'day').format('YYYY-MM-DD')
  const due: Milestone[] = []
  if (apiKey.expireAt > now && apiKey.expireAt <= j3 && !apiKey.notifiedJ3At) due.push('expiring')
  if (apiKey.expireAt <= now && !apiKey.notifiedJAt) due.push('expired')
  return due
}
