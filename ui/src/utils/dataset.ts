import { mdiTextShort, mdiTextLong, mdiFormatText, mdiCalendar, mdiClockOutline, mdiNumeric, mdiCheckboxMarkedCircleOutline, mdiCodeBraces, mdiCodeArray } from '@mdi/js'

type LocalizedTitle = { fr: string, en: string }

export type PropertyType = {
  type: string
  format?: string
  title: LocalizedTitle
  icon: string
  'x-display'?: 'textarea' | 'markdown'
  'x-capabilities'?: Record<string, boolean>
  maxLength?: number
}

export const propertyTypes: PropertyType[] = [
  { type: 'string', title: { fr: 'Texte', en: 'Text' }, icon: mdiTextShort, 'x-capabilities': { textAgg: false }, maxLength: 200 },
  { type: 'string', 'x-display': 'textarea', title: { fr: 'Texte long', en: 'Long text' }, icon: mdiTextLong, 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', 'x-display': 'markdown', title: { fr: 'Texte formaté', en: 'Formatted text' }, icon: mdiFormatText, 'x-capabilities': { index: false, values: false, textAgg: false, insensitive: false }, maxLength: 1000 },
  { type: 'string', format: 'date', title: { fr: 'Date', en: 'Date' }, icon: mdiCalendar },
  { type: 'string', format: 'date-time', title: { fr: 'Date et heure', en: 'Date and time' }, icon: mdiClockOutline },
  { type: 'integer', title: { fr: 'Nombre entier', en: 'Integer' }, icon: mdiNumeric },
  { type: 'number', title: { fr: 'Nombre', en: 'Number' }, icon: mdiNumeric },
  { type: 'boolean', title: { fr: 'Booléen', en: 'Boolean' }, icon: mdiCheckboxMarkedCircleOutline }
]

const pickLang = (locale: string): keyof LocalizedTitle => locale === 'fr' ? 'fr' : 'en'

type PropLike = { type?: string, format?: string | null, 'x-display'?: string }

export const usePropTypeTitle = () => {
  const { locale } = useI18n({ useScope: 'global' })
  return (prop: PropLike): string | undefined => {
    const lang = pickLang(locale.value)
    if (prop.type === 'object') return { fr: 'Objet JSON', en: 'JSON object' }[lang]
    if (prop.type === 'array') return { fr: 'Tableau JSON', en: 'JSON array' }[lang]
    const found = propertyTypes.find(p =>
      p.type === prop.type &&
      (p.format || null) === (prop.format || null) &&
      (p['x-display'] || null) === (prop['x-display'] || null)
    )
    return found?.title[lang]
  }
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
