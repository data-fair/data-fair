// interactive elements of the dataset table, each one can be activated separately through the
// "interaction" URL param of the embedded views
export const allInteractions = ['count', 'search', 'filters', 'sort', 'cells', 'select-cols', 'fix-cols', 'display', 'download', 'agent', 'fullscreen'] as const

export type Interaction = typeof allInteractions[number]

// the toolbar and the column header menu are rendered only when one of their own elements is
// active AND actually has something to show, so the decision lives in the table component: an
// active element is not enough (an embed has no fullscreen target and no agent chat).

/**
 * Parse the "interaction" param of an embedded view:
 *   - "1" or "true" -> everything (previous default, callers pass "1" when the param is absent)
 *   - "0", "false" or "" -> nothing (previous behavior)
 *   - "search,count" -> only these elements
 *   - "-filters" -> everything but these elements
 * Positive and negative tokens can be mixed, negative ones are applied last. A token that is not
 * in allInteractions simply matches nothing, so a "-newToken" written against a newer version
 * stays harmless here.
 */
export const parseInteractions = (param: string | undefined | null): Interaction[] => {
  if (param === undefined || param === null || param === '1' || param === 'true') return [...allInteractions]
  // "" is a legacy "?interaction=" written against the previous boolean param: back then anything
  // but "1"/"true" meant no interaction at all, keep it that way
  if (param === '' || param === '0' || param === 'false') return []
  const tokens = param.split(',').map(token => token.trim()).filter(Boolean)
  const excluded = new Set(tokens.filter(token => token.startsWith('-')).map(token => token.slice(1)))
  const included = tokens.filter(token => !token.startsWith('-'))
  const base = included.length ? allInteractions.filter(interaction => included.includes(interaction)) : [...allInteractions]
  return base.filter(interaction => !excluded.has(interaction))
}
