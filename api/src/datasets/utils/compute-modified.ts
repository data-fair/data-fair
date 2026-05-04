interface DatasetModifiedInput {
  modified?: string | null
  dataUpdatedAt?: string | null
  updatedAt?: string | null
}

/**
 * Compute the unified _modified value for a dataset.
 * Priority fallback: modified > dataUpdatedAt > updatedAt.
 * `modified` is a DCAT day-precision string ('YYYY-MM-DD'); the Date constructor
 * normalises it to midnight UTC for lexicographic sort consistency.
 */
export const computeModified = (dataset: DatasetModifiedInput): string | undefined => {
  if (dataset.modified) return new Date(dataset.modified).toISOString()
  if (dataset.dataUpdatedAt) return dataset.dataUpdatedAt
  if (dataset.updatedAt) return dataset.updatedAt
  return undefined
}
