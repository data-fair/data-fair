/**
 * What this application publishes to the AI chat as keyed host state.
 *
 * The chat retains the last value per key and re-sends the whole retained set
 * as a `<host-state>` snapshot whenever a conversation activates (first turn,
 * after a reset, after compaction). So every field costs tokens repeatedly, and
 * an empty one costs them for nothing — which is why these builders omit rather
 * than emit nulls and `{}`, and why each dataset type carries only the options
 * that apply to it.
 *
 * Pure on purpose. `useAgentState` is called from the components that own the
 * reactive sources (the layout for `location`, each creation wizard for
 * `wizard`); everything deciding WHAT to publish lives here, where it is
 * unit-tested without Vue — the same split as `url-utils.ts` next door.
 */

export interface LocationBreadcrumb { text: string }

export interface LocationStateInput {
  /** Absolute, already built by the caller via toAbsoluteUrl. */
  url: string
  path: string
  name?: string | null
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  breadcrumbs?: LocationBreadcrumb[]
}

export interface LocationState {
  url: string
  path: string
  name?: string
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  /**
   * Texts only. The trail answers "where am I in the hierarchy"; the URLs the
   * old get_current_location returned alongside are reachable through
   * list_pages and the ids already in `params`, and cost several times more.
   */
  breadcrumbs?: string[]
}

function nonEmptyRecord (value?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!value) return undefined
  return Object.keys(value).length ? value : undefined
}

function trimmed (value?: string | null): string | undefined {
  const text = value?.trim()
  return text || undefined
}

export function buildLocationState (input: LocationStateInput): LocationState {
  const state: LocationState = { url: input.url, path: input.path }
  const name = trimmed(input.name)
  if (name) state.name = name
  const params = nonEmptyRecord(input.params)
  if (params) state.params = params
  const query = nonEmptyRecord(input.query)
  if (query) state.query = query
  const trail = (input.breadcrumbs ?? []).map(b => b.text?.trim()).filter((t): t is string => !!t)
  if (trail.length) state.breadcrumbs = trail
  return state
}

export type DatasetWizardType = 'file' | 'rest' | 'virtual' | 'metaOnly'

export interface DatasetWizardInput {
  step: string
  type?: DatasetWizardType | null
  title?: string | null
  /** Whether the person can complete the creation from where they stand. */
  ready: boolean
  fileName?: string | null
  history?: boolean
  attachments?: boolean
  childrenCount?: number
}

export interface DatasetWizardState {
  step: string
  type: DatasetWizardType | 'none'
  title?: string
  ready: boolean
  file?: string
  history?: boolean
  attachments?: boolean
  children?: number
}

export function buildDatasetWizardState (input: DatasetWizardInput): DatasetWizardState {
  const state: DatasetWizardState = {
    step: input.step,
    type: input.type ?? 'none',
    ready: input.ready
  }
  const title = trimmed(input.title)
  if (title) state.title = title

  // Only the options that belong to the chosen type. A `history` flag on a file
  // dataset is noise the model has to decide to ignore.
  if (input.type === 'file') {
    // The agent cannot upload; whether a file is there decides what it can
    // usefully say next, so it is always reported, absent included.
    state.file = trimmed(input.fileName) ?? 'none'
  } else if (input.type === 'rest') {
    if (input.history !== undefined) state.history = input.history
    if (input.attachments !== undefined) state.attachments = input.attachments
  } else if (input.type === 'virtual') {
    if (input.childrenCount !== undefined) state.children = input.childrenCount
  }

  // Key order matters only for readability of the rendered line; the common
  // fields come first, then whatever the type added.
  return state
}

/**
 * The schema form on the dataset page, which is where the creation flow now ends.
 *
 * The wizard has always published `ready`, so the assistant can say "the Create
 * button is live" without looking at the screen, and `dataset-created` so a
 * declared wait wakes on the creation itself. The schema form had neither: a
 * judged run staged six columns with add_columns, asserted the Enregistrer button
 * was ready with no way to know it, and — having no event to wait on — asked the
 * person to report the save back. This is the same contract on the second half.
 */
export interface DatasetStructureInput {
  /** Columns a person put there: not the calculated or internal ones. */
  columns: number
  /** The edited copy differs from what the server holds. */
  unsaved: boolean
  /** The form itself is in a saveable state (master data, extensions). */
  valid: boolean
}

export interface DatasetStructureState {
  columns: number
  unsaved: boolean
  /** Enregistrer can be pressed right now. */
  ready: boolean
}

export function buildDatasetStructureState (input: DatasetStructureInput): DatasetStructureState {
  return {
    columns: input.columns,
    unsaved: input.unsaved,
    // Deliberately the conjunction rather than the button's own disabled prop:
    // a form with nothing staged has an inert button too, and telling someone to
    // press it would be as wrong as telling them to press an invalid one.
    ready: input.unsaved && input.valid
  }
}

export interface ApplicationWizardInput {
  step: string
  creationType?: 'copy' | 'baseApp' | null
  /** Title of the chosen model, or of the application being copied. */
  selected?: string | null
  title?: string | null
  ready: boolean
}

export interface ApplicationWizardState {
  step: string
  creationType: 'copy' | 'baseApp' | 'none'
  selected?: string
  title?: string
  ready: boolean
}

export function buildApplicationWizardState (input: ApplicationWizardInput): ApplicationWizardState {
  const state: ApplicationWizardState = {
    step: input.step,
    creationType: input.creationType ?? 'none',
    ready: input.ready
  }
  const selected = trimmed(input.selected)
  if (selected) state.selected = selected
  const title = trimmed(input.title)
  if (title) state.title = title
  return state
}
