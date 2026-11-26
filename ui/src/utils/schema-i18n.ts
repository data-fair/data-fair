// the text of a schema keyword in a locale, resolved the way vjsf resolves x-i18n-* (value[locale] ?? value.en ?? base),
// for the code that shows a schema label outside a form
export const schemaText = (node: Record<string, any> | undefined, key: string, locale: string): string | undefined => {
  if (!node) return undefined
  const override = node[`x-i18n-${key}`]
  return override?.[locale] ?? override?.en ?? node[key]
}
