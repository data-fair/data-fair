const propertyTypes = [
  { type: 'string', title: 'Texte', icon: 'mdi-text-short', 'x-capabilities': { textAgg: false }, maxLength: 200 },
  { type: 'string', 'x-display': 'textarea', title: 'Texte long', icon: 'mdi-text-subject', 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', 'x-display': 'markdown', title: 'Texte formatté', icon: 'mdi-text-subject', 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', format: 'date', title: 'Date', icon: 'mdi-calendar' },
  { type: 'string', format: 'date-time', title: 'Date et heure', icon: 'mdi-clock-outline' },
  { type: 'integer', title: 'Nombre entier', icon: 'mdi-numeric' },
  { type: 'number', title: 'Nombre', icon: 'mdi-numeric' },
  { type: 'boolean', title: 'Booléen', icon: 'mdi-checkbox-marked-circle-outline' }
]

export const propTypeTitle = (prop: { type?: string, format?: string | null }) => {
  if (prop.type === 'object') return 'Objet JSON'
  if (prop.type === 'array') return 'Tableau JSON'
  if (prop.format) {
    const type = propertyTypes.find(p => p.type === prop.type && p.format === prop.format)
    if (type) return type.title
  }
  return propertyTypes.find(p => p.type === prop.type)?.title
}

export const propTypeIcon = (prop: { type: string, format?: string }) => {
  if (prop.type === 'object') return 'mdi-code-braces'
  if (prop.type === 'array') return 'mdi-code-array'
  if (prop.format) {
    const type = propertyTypes.find(p => p.type === prop.type && p.format === prop.format)
    if (type) return type.icon
  }
  return propertyTypes.find(p => p.type === prop.type)?.icon
}
