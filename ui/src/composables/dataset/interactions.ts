// interactive elements of the dataset table, each one can be activated separately through the
// "interaction" URL param of the embedded views
export const allInteractions = ['count', 'search', 'filters', 'sort', 'cells', 'cols', 'display', 'download', 'agent', 'fullscreen'] as const

export type Interaction = typeof allInteractions[number]

// elements living in the toolbar, it is rendered only if at least one of them is active
const toolbarInteractions: Interaction[] = ['count', 'search', 'filters', 'cols', 'display', 'download', 'agent', 'fullscreen']

// elements living in the column header menu, it is rendered only if at least one of them is active
const headerMenuInteractions: Interaction[] = ['sort', 'filters', 'cols']

/**
 * Parse the "interaction" param of an embedded view:
 *   - absent, "1" or "true" -> everything (previous default)
 *   - "0" or "false" -> nothing (previous behavior)
 *   - "search,count" -> only these elements
 *   - "-filters" -> everything but these elements
 * Positive and negative tokens can be mixed, negative ones are applied last. A token that is not
 * in allInteractions simply matches nothing, so a "-newToken" written against a newer version
 * stays harmless here.
 */
export const parseInteractions = (param: string | undefined | null): Interaction[] => {
  if (!param || param === '1' || param === 'true') return [...allInteractions]
  if (param === '0' || param === 'false') return []
  const tokens = param.split(',').map(token => token.trim()).filter(Boolean)
  const excluded = new Set(tokens.filter(token => token.startsWith('-')).map(token => token.slice(1)))
  const included = tokens.filter(token => !token.startsWith('-'))
  const base = included.length ? allInteractions.filter(interaction => included.includes(interaction)) : [...allInteractions]
  return base.filter(interaction => !excluded.has(interaction))
}

export const hasToolbar = (interactions: Interaction[]) => toolbarInteractions.some(interaction => interactions.includes(interaction))

export const hasHeaderMenu = (interactions: Interaction[]) => headerMenuInteractions.some(interaction => interactions.includes(interaction))
