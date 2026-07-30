// keep this in a standalone file as it is required by workers/index.ts and we want to keep it as small as possible
import type { Dataset } from '#types'

// DatasetDraft is defined in the schema as a subset of Dataset fields.
// At runtime the draft object may carry any Dataset field (finalizedAt, bbox, …).
// We model this with a local DraftLike type to avoid unsafe casts.
type DraftLike = Dataset['draft'] & Pick<Dataset, 'finalizedAt' | 'bbox'>

export default (dataset: Dataset & { draft?: DraftLike }): Dataset => {
  if (!dataset.draft) return dataset as Dataset
  Object.assign(dataset, dataset.draft)
  if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
  if (!dataset.draft.bbox) delete dataset.bbox
  delete dataset.draft
  return dataset as Dataset
}
