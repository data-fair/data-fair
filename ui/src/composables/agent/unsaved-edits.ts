/**
 * The page's unsaved edits, as the `navigate` tool sees them.
 *
 * A page guards its pending edits with a router leave guard, which only a person can
 * answer (a `window.confirm`). The assistant never sees it: asked to fill the topics
 * of every dataset in a catalog, it set them on one, navigated to the next and the
 * next, and never noticed that nothing had been saved — each stop either discarded
 * the form or left the person facing a confirm dialog they had not caused.
 *
 * So the pages that guard their edits register them here too (`useAgentLeaveGuard`),
 * and `navigate` refuses to leave while one is pending. Pure on purpose: the registry
 * and the refusal text are unit-tested without Vue.
 */

interface UnsavedEdit {
  label: string
  isDirty: () => boolean
}

const registry = new Set<UnsavedEdit>()

export function registerUnsavedEdit (edit: UnsavedEdit): () => void {
  registry.add(edit)
  return () => { registry.delete(edit) }
}

/** Labels of the registered edits that are pending right now. */
export function pendingUnsavedEdits (): string[] {
  return [...registry].filter(edit => edit.isDirty()).map(edit => edit.label)
}

export function formatUnsavedEditsRefusal (labels: string[]): string {
  return `**Success**: false\n**Error**: this page holds unsaved edits (${labels.join(', ')}). Leaving it would discard them, so you stayed here. ` +
    'Ask the user to click Enregistrer (or Annuler to drop them) and declare wait_for_user_action to learn of the save, then navigate.'
}
