export const INDEX_WIDTH = 9

export const padIndex = (i: number): string => String(i).padStart(INDEX_WIDTH, '0')

export const revisionPrefix = (owner: { type: string, id: string }, datasetId: string): string =>
  `data-fair/${owner.type}-${owner.id}/${datasetId}/`

export const revisionKey = (owner: { type: string, id: string }, datasetId: string, i: number): string =>
  `${revisionPrefix(owner, datasetId)}${padIndex(i)}`

export const parseRevisionIndex = (key: string): number => {
  const last = key.split('/').pop() ?? ''
  return parseInt(last, 10)
}

export const nextIndex = (keys: string[]): number => {
  let max = -1
  for (const k of keys) {
    const i = parseRevisionIndex(k)
    if (!Number.isNaN(i) && i > max) max = i
  }
  return max + 1
}

export const latestKey = (keys: string[]): string | undefined => {
  if (!keys.length) return undefined
  return [...keys].sort().at(-1) // zero-padded ⇒ lexical sort == numeric order
}

export type RevisionOperation = 'create' | 'update' | 'enable' | 'fixIntegrity'
export type RevisionContext = { operation: RevisionOperation, originator: string, date: string, reason?: string }

export const buildContext = (
  operation: RevisionOperation,
  originator: string,
  date: string,
  reason?: string
): RevisionContext => ({ operation, originator, date, ...(reason ? { reason } : {}) })
