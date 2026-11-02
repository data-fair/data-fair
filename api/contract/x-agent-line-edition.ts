/**
 * Dev-only: the x-agent annotations of the line operations for the experiment comparing two ways
 * an autonomous agent writes dataset lines (docs/superpowers/specs/2026-10-28-line-edition-arms-design.md).
 * Arm `json` offers plain JSON tools, arm `editor` json-layout editor groups; reading a line and
 * deleting one are the same plain tools in both. No arm is set by default, and then the line
 * operations carry no annotation at all: the platform document is the one served in production.
 * The arm is set through the test-env router.
 */
import type { AgentOperation, JsonSchema } from '@data-fair/openapi-mcp'

export type LineEditionArm = 'json' | 'editor'

let currentArm: LineEditionArm | undefined

export const getLineEditionArm = (): LineEditionArm | undefined => currentArm

export const setLineEditionArm = (arm: LineEditionArm | undefined): void => {
  currentArm = arm
}

/** the same schema request for both editor groups: the line's JSON Schema, multi-valued columns as arrays, extension columns included (the editor hides them) */
const schemaParams = { mimeType: 'application/schema+json', arrays: true, extension: true }

const readLine: AgentOperation = {
  name: 'read_line',
  title: { fr: 'Lire une ligne', en: 'Read a line' },
  description: 'Read one line of an editable dataset by its line ID (the _id field of the rows returned by datafair_search_data).'
}

const deleteLine: AgentOperation = {
  name: 'delete_line',
  title: { fr: 'Supprimer une ligne', en: 'Delete a line' },
  description: 'Delete one line of an editable dataset by its line ID (the _id field of the rows returned by datafair_search_data).'
}

const columnsGuide = 'Read the columns first with datafair_describe_dataset: the schema gives each column\'s key, type and format, x-required (the value is mandatory), x-labels (the allowed values as key: label; with x-labelsRestricted only these keys are accepted, send the key, not the label), pattern (a regular expression the value must match) and separator (a multi-valued column: send an array of values, or one string joining them with the separator). A column with x-master holds the key of a line of a reference dataset: x-master.remoteService is "dataset:" followed by that dataset\'s ID, and the key is the value of its column sharing this column\'s x-refersTo concept; find the line with datafair_search_data on the reference dataset. Columns with x-extension or x-calculated are computed by the platform: never send them, except _id. Dates are "YYYY-MM-DD", date-times ISO 8601. With response_format detailed, datafair_describe_dataset also gives primaryKey and constraints: a unique constraint refuses a duplicate with a 409, a dateCoherence constraint refuses an end date before the start date with a 400, and both errors name the rule.'

const lineIdGuide = 'The line ID (_id) is derived from the primary key when the dataset has one; otherwise a new line gets a generated one, returned in the response, and an existing line is named by the _id field of the rows returned by datafair_search_data.'

/** body schemas of the write tools of arm `json`: the merged document's line schema is the sample dataset's, its columns are no target dataset's */
const actionProperty = {
  type: 'string',
  enum: ['create', 'update', 'createOrUpdate', 'patch', 'delete'],
  description: 'create: a new line (409 if its _id exists); update: replace a whole existing line; createOrUpdate (default): create the line, or replace it whole; patch: change only the given columns of an existing line; delete: delete the line.'
}
const idProperty = { type: 'string', description: 'The line ID. Not needed to create a line, nor when the dataset has a primary key: it is then derived from the line\'s values.' }

export const lineEditionBodies = (): Record<string, JsonSchema> => ({
  postLine: {
    type: 'object',
    description: 'The line: its values by column key, with _action and _id.',
    properties: { _action: actionProperty, _id: idProperty }
  },
  patchLine: {
    type: 'object',
    description: 'The columns to change, by column key. null clears a column.'
  },
  bulkLines: {
    type: 'array',
    description: 'The lines, each one as for datafair_write_line: its values by column key, with _action and _id.',
    items: { type: 'object', properties: { _action: actionProperty, _id: idProperty } }
  }
})

/** the annotations of the line operations in an arm, keyed by operationId */
export const lineEditionAgent = (arm: LineEditionArm): Record<string, AgentOperation> => {
  if (arm === 'editor') {
    return {
      readLine,
      deleteLine,
      postLine: {
        name: 'create_line',
        title: { fr: 'Créer une ligne', en: 'Create a line' },
        editor: { schemaOperation: 'readSchema', schemaParams }
      },
      updateLine: {
        name: 'edit_line',
        title: { fr: 'Modifier une ligne', en: 'Edit a line' },
        editor: { schemaOperation: 'readSchema', schemaParams, readOperation: 'readLine' }
      }
    }
  }
  return {
    readLine,
    deleteLine,
    postLine: {
      name: 'write_line',
      title: { fr: 'Écrire une ligne', en: 'Write a line' },
      description: `Create, replace, patch or delete one line of an editable dataset, chosen by _action (default createOrUpdate). The body is the line: its values by column key, with _action and _id. ${lineIdGuide} ${columnsGuide} A refused line answers a 400 that names the column and the rule it breaks. Returns the line as written.`,
      body: 'compact'
    },
    patchLine: {
      name: 'patch_line',
      title: { fr: 'Modifier des colonnes d\'une ligne', en: 'Patch a line' },
      description: 'Change only the given columns of an existing line, by its line ID; the others keep their values. A multi-valued column is replaced whole: to add a value, read the line with datafair_read_line and send the complete new list. Send null to clear a column. The columns are those of datafair_write_line: read them with datafair_describe_dataset. Returns the line as written.'
    },
    bulkLines: {
      name: 'bulk_lines',
      title: { fr: 'Écrire des lignes en masse', en: 'Write lines in bulk' },
      description: `Apply several line operations in one call, each line as for datafair_write_line (its _action, default createOrUpdate). ${lineIdGuide} ${columnsGuide} The answer is per line: nbOk, nbCreated, nbModified, nbDeleted, nbErrors and errors[] (the first 50), one entry per refused line with its position in the list (line, from 0), its status and the error. A line in error is not written, the others are; the call answers 400 when no line was written.`,
      params: {
        drop: { exclude: true },
        async: { exclude: true },
        sep: { exclude: true },
        lock: { exclude: true }
      }
    }
  }
}
