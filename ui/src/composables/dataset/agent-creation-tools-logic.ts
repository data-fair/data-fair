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
