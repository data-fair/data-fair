import type { Dataset, RestDataset } from '@data-fair/data-fair-api/types/index.ts'

export function isRestDataset (dataset: Dataset): dataset is RestDataset {
  return !!dataset.isRest
}
