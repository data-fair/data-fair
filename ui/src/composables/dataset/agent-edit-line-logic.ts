/**
 * Pure logic for the line-editing tools, kept apart so the node unit runner
 * can test them without a component.
 */

/** Columns a person can type into: not the calculated system ones. */
export function fillableColumns (schema: Array<Record<string, any>> | undefined): Array<Record<string, any>> {
  return (schema ?? []).filter(f => f && !f['x-calculated'] && typeof f.key === 'string' && !f.key.startsWith('_'))
}

/**
 * Why the add-line dialog should stay closed, or undefined when it may open.
 *
 * The dialog cannot create columns. Opening it on a dataset that has none and
 * answering "you can now fill in the form fields" sent a judged run's assistant
 * into two sub-agent round trips on an empty form and then a manual six-column
 * procedure the person had never asked for. Refusing here, with the real
 * prerequisite named, is what keeps that path closed.
 */
export function addLineDialogPrecondition (schema: Array<Record<string, any>> | undefined): string | undefined {
  if (fillableColumns(schema).length) return undefined
  return 'Nothing to fill yet: this dataset has no columns, so the add-line dialog stays closed. ' +
    'Declare its columns first with add_columns, on the dataset page under Structure > Schéma.'
}

/** The subagent the line dialogs' form registers (json-layout WebMCP, prefix `editLine_`). */
export const LINE_FORM_SUBAGENT = 'subagent_editLine_form'

/** Whether a tool list, as navigator.modelContext.listTools() returns it, holds the line form subagent. */
export function hasLineFormSubAgent (tools: unknown): boolean {
  return Array.isArray(tools) && tools.some(t => t?.name === LINE_FORM_SUBAGENT)
}

/**
 * What the line dialog openers report, once they have waited for the form's
 * subagent to register.
 *
 * The chat makes a tool registered while a host tool runs usable on its very next
 * step, so a ready form needs no wait. Asking for one anyway stalled a real
 * session: the dialog's opening event reached the chat before the opener's
 * result, was delivered inside it, and left the declared wait nothing to resolve
 * on. Not ready is the bounded wait running out (a slow schema fetch); calling
 * the opener again re-checks without reopening anything.
 */
export function lineDialogOpenedResult (mode: 'add' | 'edit', formReady: boolean): string {
  const dialog = mode === 'add' ? 'Add line dialog' : 'Edit line dialog'
  if (!formReady) {
    const retry = mode === 'add' ? 'open_add_line_dialog' : 'open_edit_line_dialog with the same lineId'
    return `${dialog} opened, but its form is still loading, so the editLine_form subagent is not available yet. Call ${retry} again to check.`
  }
  return `${dialog} opened and its form is ready: delegate to the editLine_form subagent now to ${mode === 'add' ? 'fill' : 'modify'} it. ` +
    'When the form is ready, tell the user the Enregistrer button is ready and declare wait_for_user_action: the save reports itself, so you learn of it without asking them to say so.'
}
