// Pure functions only. No es client / mongo / node-config imports here.

import crypto from 'node:crypto'

/**
 * Parse a data-fair ES index name and return the dataset id, or null if the
 * name does not match the data-fair scheme. Pure function.
 *
 *   `${indicesPrefix}-${datasetId}-${12-hex-sha1(datasetId)}[-${timestampDigits}]`
 *
 * The dataset id may itself contain "-"; the 12-hex segment is the disambiguator.
 */
export const parseIndexName = (indexName: string, indicesPrefix: string): string | null => {
  if (typeof indexName !== 'string' || !indexName) return null
  const head = `${indicesPrefix}-`
  if (!indexName.startsWith(head)) return null
  const rest = indexName.slice(head.length)
  // match: <datasetId>-<12 hex>[-<digits>]   (greedy on datasetId)
  const m = rest.match(/^(.+)-([0-9a-f]{12})(?:-\d+)?$/)
  if (!m) return null
  const candidateId = m[1]
  const candidateHash = m[2]
  const expected = crypto.createHash('sha1').update(candidateId).digest('hex').slice(0, 12)
  return expected === candidateHash ? candidateId : null
}
