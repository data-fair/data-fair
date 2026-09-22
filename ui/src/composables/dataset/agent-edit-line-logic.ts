/**
 * Preconditions for the line-editing tools, kept pure so the node unit runner
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
