// keep this in a standalone file as it is required by workers/index.ts and we want to keep it as small as possible
export default (dataset) => {
  if (!dataset.draft) return dataset
  Object.assign(dataset, dataset.draft)
  if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
  if (!dataset.draft.bbox) delete dataset.bbox
  delete dataset.draft
  return dataset
}
