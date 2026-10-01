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

/** What the wizard's initialization step can copy from an existing dataset (dataset-init-from.vue). */
export const INIT_FROM_PARTS = ['schema', 'data', 'extensions', 'metadataAttachments', 'description'] as const

/**
 * The parts init_from_dataset will copy, or why it cannot. The columns (schema) are always
 * part of it, as in the wizard where they are the default. Data is refused where the wizard
 * refuses it: when the step does not offer it, and from a source with no rows.
 */
export function resolveInitParts (requested: string[] | undefined, opts: { allowData: boolean, sourceHasData: boolean }): { parts: string[] } | { error: string } {
  const parts = new Set<string>(['schema', ...(requested ?? [])])
  const unknown = [...parts].filter(p => !(INIT_FROM_PARTS as readonly string[]).includes(p))
  if (unknown.length) return { error: `unknown part(s) ${unknown.join(', ')} — pick from ${INIT_FROM_PARTS.join(', ')}` }
  if (parts.has('data') && !opts.allowData) return { error: 'copying the data is not offered for this new dataset; copy the structure only' }
  if (parts.has('data') && !opts.sourceHasData) return { error: 'the source dataset has no rows to copy; copy the structure only' }
  return { parts: INIT_FROM_PARTS.filter(p => parts.has(p)) }
}

/** Whether the source has rows the data part could copy — the same rule as dataset-init-from.vue. */
export function sourceHasData (source: { file?: unknown, count?: number }): boolean {
  return !!source.file || !!source.count
}
