import { mdiTextShort, mdiTextLong, mdiFormatText, mdiCalendar, mdiClockOutline, mdiNumeric, mdiCheckboxMarkedCircleOutline, mdiCodeBraces, mdiCodeArray } from '@mdi/js'

const propertyTypes = [
  { type: 'string', title: 'Texte', icon: mdiTextShort, 'x-capabilities': { textAgg: false }, maxLength: 200 },
  { type: 'string', 'x-display': 'textarea', title: 'Texte long', icon: mdiTextLong, 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', 'x-display': 'markdown', title: 'Texte formatté', icon: mdiFormatText, 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', format: 'date', title: 'Date', icon: mdiCalendar },
  { type: 'string', format: 'date-time', title: 'Date et heure', icon: mdiClockOutline },
  { type: 'integer', title: 'Nombre entier', icon: mdiNumeric },
  { type: 'number', title: 'Nombre', icon: mdiNumeric },
  { type: 'boolean', title: 'Booléen', icon: mdiCheckboxMarkedCircleOutline }
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
  if (prop.type === 'object') return mdiCodeBraces
  if (prop.type === 'array') return mdiCodeArray
  if (prop.format) {
    const type = propertyTypes.find(p => p.type === prop.type && p.format === prop.format)
    if (type) return type.icon
  }
  return propertyTypes.find(p => p.type === prop.type)?.icon
}

export const accepted = [
  '.csv',
  '.geojson',
  '.gpkg',
  '.zip',
  '.ods',
  '.fods',
  '.xlsx',
  '.xls',
  '.dbf',
  '.txt',
  '.dif',
  '.tsv',
  '.kml',
  '.kmz',
  '.xml',
  '.gpx',
  '.ics',
  '.geojson.gz',
  '.csv.gz',
  '.tsv.gz'
]
