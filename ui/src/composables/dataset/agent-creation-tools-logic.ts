/**
 * Pure helpers for the dataset creation tools, testable without a component.
 */

/** Resolves true the moment `isReady()` does, or false once `timeoutMs` has passed. */
export function untilReady (isReady: () => boolean, timeoutMs: number, tickMs = 50): Promise<boolean> {
  if (isReady()) return Promise.resolve(true)
  const deadline = Date.now() + timeoutMs
  return new Promise(resolve => {
    const timer = setInterval(() => {
      if (isReady()) { clearInterval(timer); resolve(true) } else if (Date.now() >= deadline) { clearInterval(timer); resolve(false) }
    }, tickMs)
  })
}

/**
 * What advance_to_confirmation reports. `ready` is the wizard's own readiness
 * (params valid, conflict check passed, owner) observed after the step change,
 * and `actionLabel` the label the page actually shows on the button — a judged
 * run twice had the assistant tell the person to click « Créer » when the
 * button read « Créer le jeu de données ».
 */
export function formatAdvanceResult (ready: boolean, actionLabel: string): string {
  if (ready) return `The wizard is on the confirmation step and the form is ready: the user can click « ${actionLabel} ».`
  return 'The wizard is on the confirmation step, but its readiness check has not finished (a title conflict may be pending). The wizard state reports `ready` once it has; tell the user the button is ready only then.'
}

/**
 * What the wizard's initialization step can copy from an existing dataset — the API's own
 * list (post-req schema): structure parts, then each metadata field on its own.
 */
export const INIT_FROM_PARTS = ['schema', 'data', 'extensions', 'metadataAttachments', 'primaryKey',
  'summary', 'description', 'license', 'origin', 'image', 'topics', 'keywords', 'searchTerms', 'spatial',
  'temporal', 'frequency', 'creator', 'modified', 'customMetadata', 'relatedDatasets'] as const

interface InitSource { file?: unknown, count?: number, finalizedAt?: string, isMetaOnly?: boolean }

/**
 * The parts init_from_dataset will copy, or why it cannot. Without parts asked for, the
 * step's own default stands (undefined): the columns, or all the metadata of a
 * metadata-only source. Asked-for parts include the columns, except from a metadata-only
 * source, which has none. Data is refused where the step refuses it.
 */
export function resolveInitParts (requested: string[] | undefined, source: InitSource, opts: { allowData: boolean }): { parts?: string[] } | { error: string } {
  if (!requested?.length) return {}
  const parts = new Set<string>([...(source.isMetaOnly ? [] : ['schema']), ...requested])
  const unknown = [...parts].filter(p => !(INIT_FROM_PARTS as readonly string[]).includes(p))
  if (unknown.length) return { error: `unknown part(s) ${unknown.join(', ')} — pick from ${INIT_FROM_PARTS.join(', ')}` }
  if (parts.has('data')) {
    const reason = noDataReason(source, opts.allowData)
    if (reason) return { error: reason }
  }
  return { parts: INIT_FROM_PARTS.filter(p => parts.has(p)) }
}

/** Why the data cannot be copied, the same rules as dataset-init-from.vue, or null. */
export function noDataReason (source: InitSource, allowData: boolean): string | null {
  if (!allowData || source.isMetaOnly) return 'copying the data is not offered for this new dataset or source; copy the structure only'
  if (source.file) return null
  if (!source.finalizedAt) return 'the source dataset is not finalized yet; copy the structure only'
  if (!source.count) return 'the source dataset has no rows to copy; copy the structure only'
  return null
}
