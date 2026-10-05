// Numbers are shown in the UI's locale, not the browser's: a bare toLocaleString()
// rendered '2,500' in the French interface of an English browser.
//
// Grouping starts at 5 digits ('min2'), which is French typographic usage and keeps
// year-like integers readable ('1987', not '1 987') without guessing which columns hold years.

const formatters = new Map<string, Intl.NumberFormat>()

export const formatNumber = (value: number, locale: string): string => {
  let formatter = formatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { useGrouping: 'min2' })
    formatters.set(locale, formatter)
  }
  return formatter.format(value)
}
