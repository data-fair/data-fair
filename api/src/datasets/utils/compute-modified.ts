interface DatasetModifiedInput {
  modified?: string | null
  dataUpdatedAt?: string | null
  updatedAt?: string | null
}

/**
 * Compute the unified _modified value for a dataset.
 * Priority fallback: modified > dataUpdatedAt > updatedAt.
 * `modified` is a DCAT day-precision string ('YYYY-MM-DD'); when it wins it is
 * expanded to ISO date-time at midnight UTC for lexicographic sort consistency.
 */
export const computeModified = (dataset: DatasetModifiedInput): string | undefined => {
  if (dataset.modified) {
    return dataset.modified.length === 10
      ? `${dataset.modified}T00:00:00.000Z`
      : dataset.modified
  }
  if (dataset.dataUpdatedAt) return dataset.dataUpdatedAt
  if (dataset.updatedAt) return dataset.updatedAt
  return undefined
}
