// The transient per-line pipeline flags carried inside line documents (the transactional-outbox
// pattern requires in-document flags — see docs/architecture/integrity.md §3.2). Every reader that
// re-emits a line doc outside the pipeline (API responses, ES projection, rest.history revisions)
// must strip them; a new flag added here is stripped at every site at once.
export const TRANSIENT_LINE_FLAGS = ['_needsIndexing', '_needsExtending', '_needsHistorizing'] as const

export const stripTransientLineFlags = <T extends Record<string, any>>(doc: T): T => {
  for (const flag of TRANSIENT_LINE_FLAGS) delete doc[flag]
  return doc
}
